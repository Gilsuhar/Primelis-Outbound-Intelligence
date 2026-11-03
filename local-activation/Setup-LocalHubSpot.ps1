#requires -Version 7.0
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'LocalHubSpot-Tools.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=$null;$tokenBox=$null
try {
 if(Test-Path -LiteralPath (Get-LocalHubSpotPath)){throw 'HUBSPOT_EXISTING_CONFIG_PRESERVED'}
 $form=[Windows.Forms.Form]::new();$form.Text='Agent Workforce - private HubSpot setup'
 $form.Size=[Drawing.Size]::new(650,285);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog'
 $form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.TopMost=$true
 $label=[Windows.Forms.Label]::new();$label.Location=[Drawing.Point]::new(20,15);$label.Size=[Drawing.Size]::new(600,95)
 $label.Text="Enter the existing HubSpot PRIVATE APP ACCESS TOKEN below (masked).`nAccount 144053930; contacts restricted to Gil (1087915602).`nContact/company read access required; write permissions are rejected.`nSaved with Windows encryption for this user only. No CRM records are changed."
 $form.Controls.Add($label)
 $tokenBox=[Windows.Forms.TextBox]::new();$tokenBox.Location=[Drawing.Point]::new(20,115);$tokenBox.Size=[Drawing.Size]::new(600,26)
 $tokenBox.UseSystemPasswordChar=$true;$tokenBox.MaxLength=4096;$form.Controls.Add($tokenBox)
 $ok=[Windows.Forms.Button]::new();$ok.Text='Verify and save securely';$ok.Location=[Drawing.Point]::new(285,170);$ok.Size=[Drawing.Size]::new(210,34);$ok.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Controls.Add($ok)
 $cancel=[Windows.Forms.Button]::new();$cancel.Text='Cancel';$cancel.Location=[Drawing.Point]::new(510,170);$cancel.Size=[Drawing.Size]::new(110,34);$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel;$form.Controls.Add($cancel)
 $form.CancelButton=$cancel;$form.AcceptButton=$ok;$form.Add_Shown({$form.Activate();$tokenBox.Focus()})
 if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw 'HUBSPOT_SETUP_CANCELLED'}
 $info=Confirm-LocalHubSpotToken $tokenBox.Text
 Save-LocalHubSpotConfiguration -Token $tokenBox.Text -Info $info
 $tokenBox.Clear()
 $saved=Read-SavedLocalHubSpotConfiguration
 if(-not $saved){throw 'HUBSPOT_SAVED_CONFIG_INVALID'}
 $saved.token=$null;$saved=$null
 [void][Windows.Forms.MessageBox]::Show('Saved and verified. The application restart and evidence read will be verified next.','Agent Workforce - HubSpot setup complete')
} catch {
 $safe=$_.Exception.Message
 if($safe -notmatch '^HUBSPOT_[A-Z_]+$'){$safe='HUBSPOT_SETUP_FAILED'}
 $detail=''
 if($_.Exception.Data.Contains('saveStage')){
  $saveStage=[string]$_.Exception.Data['saveStage'];$hr=$_.Exception.Data['hresult'];$native=$_.Exception.Data['nativeErrorCode']
  if($saveStage -cin @('SAVE_VALIDATION','DIRECTORY_VALIDATION','ASSEMBLY_LOAD','SERIALIZATION','DPAPI_ENCRYPTION','FILE_CREATE','FILE_WRITE','FILE_FLUSH_CLOSE','FILE_PERMISSIONS','DIAGNOSTIC_WRITE')){
   $detail="`nSave stage: $saveStage"
   if($hr -is [int]){$detail+=("`nWindows HRESULT: 0x{0:X8}" -f $hr)}
   if($native -is [int]){$detail+="`nWindows error code: $native"}
   if($_.Exception.Data['diagnosticSaved'] -eq $false){$detail+="`nDiagnostic file could not be saved."}
  }
 }
 if($_.Exception.Data.Contains('stage')){
  $stage=[string]$_.Exception.Data['stage'];$status=$_.Exception.Data['httpStatus']
  if($stage -cin @('INPUT','CLIENT_SETUP','HTTP_REQUEST','HTTP_RESPONSE','RESPONSE_PARSE','ACCOUNT_SCOPE_VALIDATION','COMPLETE')){
   $detail="`nStage: $stage"
   if($status -is [int] -and $status -ge 100 -and $status -le 599){$detail+="`nHTTP status: $status"}else{$detail+="`nHTTP status: unavailable (no response recorded)"}
   if($_.Exception.Data['diagnosticSaved'] -eq $false){$detail+="`nDiagnostic file could not be saved."}
  }
 }
 [void][Windows.Forms.MessageBox]::Show(('Stopped: '+$safe+$detail+"`nNo automatic retry; existing configuration preserved."),'Agent Workforce - HubSpot setup')
 exit 1
} finally {if($tokenBox){$tokenBox.Clear()};if($form){$form.Dispose()};$info=$null;$saved=$null}
