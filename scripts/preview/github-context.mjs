export const repository = "Gilsuhar/Primelis-Outbound-Intelligence";
// Public immutable IDs verified through GitHub repository metadata; never configurable inputs.
export const repositoryId = "1299364799";
export const owner = "Gilsuhar";
export const ownerId = "79252537";
export const tagPrefix = "agent-workforce-preview-setup-txfxfrlhtvzwgluhnbpw-";
export const environment = "agent-workforce-preview-setup";
export const workflow = ".github/workflows/preview-database-setup.yml";
const deny = () => { throw new Error("PREVIEW_SETUP_GITHUB_APPROVAL_REJECTED"); };

export function validateGitHubContext(env) {
  const ref = `refs/tags/${tagPrefix}${env.GITHUB_SHA}`;
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== ref ||
      env.GITHUB_REPOSITORY_ID !== repositoryId || env.GITHUB_REPOSITORY_OWNER_ID !== ownerId ||
      env.GITHUB_ACTOR_ID !== ownerId || env.GITHUB_ACTOR !== owner ||
      env.GITHUB_TRIGGERING_ACTOR !== owner ||
      env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_RUN_ATTEMPT !== "1" ||
      env.GITHUB_WORKFLOW_REF !== `${repository}/${workflow}@${ref}` ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") ||
      env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA ||
      env.PREVIEW_SETUP_APPROVED_SHA !== env.GITHUB_SHA ||
      env.PREVIEW_SETUP_ENVIRONMENT !== environment ||
      !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") ||
      env.ACTIONS_STEP_DEBUG === "true" || env.ACTIONS_RUNNER_DEBUG === "true") deny();
}

/** Read-only GitHub APIs: never approve a job or change environment protection here. */
export async function verifyGitHubApproval(env, request = fetch) {
  validateGitHubContext(env);
  if (!env.GITHUB_TOKEN) deny();
  const get = async path => {
    const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28" },
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) deny();
    return response.json();
  };
  // Actor identity comes from GitHub, not commit author/pusher display names or tag contents.
  // A matching username alone is insufficient, including after account/repository transfers.
  const run = await get(`actions/runs/${env.GITHUB_RUN_ID}`);
  const isOwner = value => value?.id === Number(ownerId) && value.login === owner && value.type === "User";
  if (String(run.id) !== env.GITHUB_RUN_ID || run.event !== "push" || run.run_attempt !== 1 ||
      run.head_sha !== env.GITHUB_SHA || !isOwner(run.actor) || !isOwner(run.triggering_actor) ||
      run.repository?.id !== Number(repositoryId) || run.repository.full_name !== repository ||
      run.repository.fork !== false || !isOwner(run.repository.owner)) deny();
  const config = await get(`environments/${environment}`);
  if (config.name !== environment || !Number.isSafeInteger(config.id) ||
      config.can_admins_bypass !== false ||
      config.deployment_branch_policy?.custom_branch_policies !== true ||
      config.deployment_branch_policy?.protected_branches !== false) deny();
  const policies = await get(`environments/${environment}/deployment-branch-policies?per_page=100`);
  if (policies.total_count !== 1 || policies.branch_policies?.length !== 1 ||
      policies.branch_policies[0].name !== `${tagPrefix}${env.GITHUB_SHA}` ||
      policies.branch_policies[0].type !== "tag") deny();
}
