/* eslint-disable @typescript-eslint/no-require-imports -- Private Node CommonJS launcher, matching the existing handoff. */
// One approved private source publication. No database/provider/workflow mutations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {gitFailure,finishPublication}=require('./CiPublicationDiagnostics.cjs');
const run=__dirname;
const stage='C:/Users/USER/AppData/Local/Temp/agentworkforce-ci-publication-4895a812bd8d4fd782c5f6a3052a3f67';
const commit='db48e581750848fe68956aaf47c7b6a5a9fb4b60';
const repo='Gilsuhar/agentworkforce-ci-acceptance',remote='https://github.com/'+repo+'.git';
const gh='C:/Users/USER/AppData/Local/Programs/GitHubCLI-Portable/2.102.0/bin/gh.exe';
const git='C:/Program Files/Git/cmd/git.exe';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=c=>{throw new Error(c)};
let token,step='INPUT',pushAttempted=false;
const report={repository:repo,repositoryId:1426200737,commit,startedAt:new Date().toISOString(),publicationStatus:'UNKNOWN'};
function environment(){
 const env={};
 for(const k of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','COMSPEC'])
  if(process.env[k])env[k]=process.env[k];
 return env;
}
function gitRun(args,auth=false){
 const env=environment();
 Object.assign(env,{GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL'});
 if(auth)Object.assign(env,{GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'credential.helper',GIT_CONFIG_VALUE_0:'',
  GIT_CONFIG_KEY_1:'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_1:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')});
 try{
  let r;
  try{r=spawnSync(git,['-C',stage,...args],{env,windowsHide:true,timeout:120000,maxBuffer:2000000});}
  catch(error){r={status:null,error};}
  if(r.status!==0||r.error){
   const diagnostic=gitFailure(r,{stage:step,operation:args[0],secrets:[token]});
   (report.gitFailures??=[]).push(diagnostic);
   if(args[0]==='push'&&!report.pushFailure)report.pushFailure=diagnostic;
   fail('PUBLICATION_GIT_FAILED');
  }
  return r.stdout;
 }finally{delete env.GIT_CONFIG_VALUE_1}
}
function api(endpoint){
 const permitted=['user','repos/'+repo,'repos/'+repo+'/actions/permissions','repos/'+repo+'/hooks?per_page=100','repos/'+repo+'/deployments?per_page=100','repos/'+repo+'/actions/runs?per_page=1','repos/'+repo+'/branches?per_page=100','repos/'+repo+'/git/ref/heads/main','repos/'+repo+'/git/trees/'+commit+'?recursive=1'];
 if(!permitted.includes(endpoint))fail('PUBLICATION_API_ENDPOINT_DENIED');
 report.lastReadEndpoint=endpoint;
 if(sha(fs.readFileSync(gh))!=='756724853cc579510b58e65e7a7429ad6b1af29cf99ef19b3a95f3b701c5c580')fail('PUBLICATION_GH_CHANGED');
 const env=environment();
 Object.assign(env,{GH_TOKEN:token,GH_HOST:'github.com',GH_CONFIG_DIR:path.join(run,'empty-gh-config'),GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1'});
 try{
  const r=spawnSync(gh,['api','--hostname','github.com','--method','GET',endpoint],{env,windowsHide:true,timeout:30000,maxBuffer:2000000,encoding:'utf8'});
  if(r.status!==0||r.error){
   const status=r.stderr?.match(/HTTP (\d{3})/)?.[1];
   report.failedReadEndpoint=endpoint;
   if(status)report.httpStatus=Number(status);
   fail(status?'PUBLICATION_GITHUB_HTTP_'+status:'PUBLICATION_GITHUB_READ_FAILED')
  }
  const value=JSON.parse(r.stdout);
  (report.successfulReadEndpoints??=[]).push(endpoint);
  return value;
 }finally{delete env.GH_TOKEN}
}
function isolation(){
 const r=api('repos/'+repo);
 if(r.id!==1426200737||r.full_name!==repo||r.owner?.id!==79252537||r.private!==true||r.visibility!=='private'||r.fork||r.archived||r.disabled||r.has_pages)fail('PUBLICATION_IDENTITY_OR_PRIVACY_DENIED');
 if(api('repos/'+repo+'/actions/permissions').enabled!==false)fail('PUBLICATION_ACTIONS_NOT_DISABLED');
 const hooks=api('repos/'+repo+'/hooks?per_page=100');
 const deployments=api('repos/'+repo+'/deployments?per_page=100');
 const runs=api('repos/'+repo+'/actions/runs?per_page=1');
 if(!Array.isArray(hooks)||hooks.length||!Array.isArray(deployments)||deployments.length||runs.total_count!==0)fail('PUBLICATION_DEPLOYMENT_ISOLATION_DENIED');
 return {private:true,actionsEnabled:false,webhooks:0,deployments:0,workflowRuns:0};
}
function inventory(){
 if(sha(fs.readFileSync(path.join(run,'review.json')))!=='5b464c049ccd031b1509d53529eebe257039775f9ec04bd750b090424e3f4372')fail('PUBLICATION_REVIEW_HASH_CHANGED');
 const review=JSON.parse(fs.readFileSync(path.join(run,'review.json'),'utf8'));
 if(review.repository!==repo||review.repositoryId!=='1426200737'||review.fileCount!==66||review.files.length!==66)fail('PUBLICATION_REVIEW_INVALID');
 if(gitRun(['rev-parse','HEAD']).toString().trim()!==commit)fail('PUBLICATION_COMMIT_CHANGED');
 if(gitRun(['status','--porcelain']).length)fail('PUBLICATION_DIRTY_STAGE');
 if(gitRun(['remote','get-url','origin']).toString().trim()!==remote)fail('PUBLICATION_REMOTE_CHANGED');
 const tree=gitRun(['ls-tree','-r','--name-only','-z',commit]).toString().split('\0').filter(Boolean).sort();
 if(JSON.stringify(tree)!==JSON.stringify(review.files.map(f=>f.path).sort()))fail('PUBLICATION_INVENTORY_CHANGED');
 for(const f of review.files){
  if(f.path.startsWith('.')||f.path.includes('..')||/env|LOCAL_PROGRESS|approval\.json|exports|\.sql$|runtime-handoff/i.test(f.path))fail('PUBLICATION_PATH_DENIED');
  const b=gitRun(['show',commit+':'+f.path]);
  if(b.length!==f.bytes||sha(b)!==f.sha256)fail('PUBLICATION_CONTENT_CHANGED');
 }
 return review;
}
function main(){
 if(fs.existsSync(path.join(run,'cancelled.json'))||fs.existsSync(path.join(run,'result.json')))fail('PUBLICATION_CLOSED');
 if(process.stdin.isTTY)fail('PUBLICATION_PRIVATE_STDIN_REQUIRED');
 if(fs.existsSync(path.join(run,'push-started.json')))fail('PUBLICATION_ALREADY_ATTEMPTED');
 token=fs.readFileSync(0,'utf8').trim();
 if(!/^github_pat_[A-Za-z0-9_]{20,250}$/.test(token))fail('PUBLICATION_TOKEN_FORMAT');
 const owner=JSON.parse(fs.readFileSync(path.join(run,'operator-isolation.json'),'utf8').replace(/^\uFEFF/,''));
 const when=Date.parse(owner.confirmedAt);
 if(owner.kind!=='OPERATOR_CONFIRMED_NO_APPS_OR_EXTERNAL_DEPLOYMENTS'||!Number.isFinite(when)||when>Date.now()||Date.now()-when>30*60000)fail('PUBLICATION_OWNER_ISOLATION_REQUIRED');
 report.appsAndExternalDeploymentEvidence=owner;
 step='LOCAL_INVENTORY';
 const review=inventory();
 report.fileCount=review.fileCount;report.reviewSha256=sha(fs.readFileSync(path.join(run,'review.json')));
 step='REMOTE_PREFLIGHT';
 const me=api('user');
 if(me.id!==79252537||me.login!=='Gilsuhar')fail('PUBLICATION_OWNER_MISMATCH');
 report.before=isolation();
 const branches=api('repos/'+repo+'/branches?per_page=100');
 if(!Array.isArray(branches))fail('PUBLICATION_TARGET_UNKNOWN');
 const refs=gitRun(['ls-remote','origin'],true).toString().trim();
 if(branches.length===1&&branches[0].name==='main'&&branches[0].commit?.sha===commit){
  const lines=refs.split('\n').map(x=>x.trim());
  if(!lines.every(x=>x===commit+'\tHEAD'||x===commit+'\trefs/heads/main')||!lines.includes(commit+'\trefs/heads/main'))fail('PUBLICATION_EXISTING_REFS_CHANGED');
  report.existingPublication=true;
 }else{
  if(branches.length||refs)fail('PUBLICATION_TARGET_NOT_EMPTY');
  report.existingPublication=false;
  step='FINAL_RECHECK';
  inventory();isolation();
  if(gitRun(['ls-remote','origin'],true).length)fail('PUBLICATION_TARGET_CHANGED');
 }
 const completion=finishPublication({
  expectedCommit:commit,
  push:report.existingPublication?undefined:()=>{
   fs.writeFileSync(path.join(run,'push-started.json'),JSON.stringify({commit,at:new Date().toISOString()}),{flag:'wx'});
   pushAttempted=true;step='PUSH';
   // One ordinary push only. Failure is followed by reads, never a retry.
   gitRun(['push','--porcelain','origin',commit+':refs/heads/main'],true);
  },
  readRefs:()=>{step='VERIFY_REMOTE_REFS';return gitRun(['ls-remote','origin'],true);},
  verifyInventory:()=>{verifyPublishedInventory(review);return true;},
  verifyIsolation:()=>{step='POST_ISOLATION';report.after=isolation();return true;}
 });
 report.publicationStatus=completion.publicationStatus;
 report.publicationVerificationReason=completion.reason;
 if(completion.pushFailed){step='PUSH';fail('PUBLICATION_GIT_FAILED');}
 if(completion.publicationStatus!=='VERIFIED_PUBLISHED')fail('PUBLICATION_REMOTE_UNVERIFIED');
 report.status='PRIVATE_SOURCE_PUBLICATION_VERIFIED';
 report.inventoryVerified=true;
 report.noActiveWorkflowFiles=true;
}
function verifyPublishedInventory(review){
 step='VERIFY_PUBLISHED_COMMIT';
 const ref=api('repos/'+repo+'/git/ref/heads/main');
 if(ref.object?.sha!==commit)fail('PUBLICATION_REMOTE_COMMIT_MISMATCH');
 const tree=api('repos/'+repo+'/git/trees/'+commit+'?recursive=1');
 if(tree.truncated)fail('PUBLICATION_TREE_TRUNCATED');
 const blobs=tree.tree.filter(x=>x.type==='blob').sort((a,b)=>a.path.localeCompare(b.path));
 if(blobs.length!==66)fail('PUBLICATION_REMOTE_INVENTORY_CHANGED');
 for(const f of review.files){
  const b=blobs.find(x=>x.path===f.path);
  if(!b||b.mode!=='100644'||b.size!==f.bytes)fail('PUBLICATION_REMOTE_BLOB_MISMATCH');
  const local=gitRun(['rev-parse',commit+':'+f.path]).toString().trim();
  if(b.sha!==local)fail('PUBLICATION_REMOTE_BLOB_HASH_MISMATCH');
 }
 report.inventoryVerified=true;
}
if(require.main===module){
 try{main()}catch(e){
  report.status='STOPPED';report.stage=step;
  report.code=/^PUBLICATION_[A-Z0-9_]{1,90}$/.test(e?.message??'')?e.message:'PUBLICATION_FAILED_CLOSED';
  process.exitCode=1;
 }finally{
  token=undefined;report.pushAttempted=pushAttempted;report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,stage:report.stage,code:report.code}));
 }
}
module.exports={inventory};
