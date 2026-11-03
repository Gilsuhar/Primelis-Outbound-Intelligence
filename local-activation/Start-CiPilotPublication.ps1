$ErrorActionPreference='Stop'
$proc=$null
$tokenBox=$null
$dialog=$null
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $helper=Join-Path $PSScriptRoot 'publish.cjs'
    $ready=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ready.json') -Raw | ConvertFrom-Json
    function Assert-PrivateFiles {
        if ((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ready.helperSha256 -or
            (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'CiPublicationDiagnostics.cjs') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ready.diagnosticsSha256 -or
            (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'review.json') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ready.reviewSha256 -or
            (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'result.json')) -or
            (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'push-started.json'))) { throw 'PRIVATE_PUBLICATION_PREFLIGHT_STOPPED' }
    }
    Assert-PrivateFiles
    $confirm=[Windows.Forms.MessageBox]::Show(
        "Confirm no GitHub App or external deployment service (including Vercel/Lovable) has access to Gilsuhar/agentworkforce-ci-acceptance, and that your owner-reviewed isolation is unchanged.`n`nThe next dialog accepts the NEW token in a masked field. Remote identity, privacy, Actions disabled and hooks are checked before publication. No existing publication will be repeated.`n`nYes continues the already-approved 66-file publication. No/Cancel stops.",
        'Agent Workforce - confirm isolation',
        [Windows.Forms.MessageBoxButtons]::YesNoCancel,
        [Windows.Forms.MessageBoxIcon]::Question,
        [Windows.Forms.MessageBoxDefaultButton]::Button3)
    if ($confirm -ne [Windows.Forms.DialogResult]::Yes) { throw 'PRIVATE_PUBLICATION_CANCELLED' }
    $confirmedAt=[DateTime]::UtcNow.ToString('o')
    $dialog=[Windows.Forms.Form]::new()
    $dialog.Text='Agent Workforce - PRIVATE masked token input'
    $dialog.Size=[Drawing.Size]::new(660,260)
    $dialog.StartPosition='CenterScreen'
    $dialog.FormBorderStyle='FixedDialog'
    $dialog.MaximizeBox=$false
    $dialog.MinimizeBox=$false
    $label=[Windows.Forms.Label]::new()
    $label.Location=[Drawing.Point]::new(20,15)
    $label.Size=[Drawing.Size]::new(610,85)
    $label.Text="Paste the unexposed token with UPDATED permissions in the masked box below.`nRepository: Gilsuhar/agentworkforce-ci-acceptance ONLY.`nContents write; Administration, Webhooks, Actions, Deployments, Metadata read.`nNo token is saved. This window closes safely; no terminal prompt follows."
    $dialog.Controls.Add($label)
    $tokenBox=[Windows.Forms.TextBox]::new()
    $tokenBox.Location=[Drawing.Point]::new(20,105)
    $tokenBox.Size=[Drawing.Size]::new(600,25)
    $tokenBox.UseSystemPasswordChar=$true
    $tokenBox.MaxLength=280
    $dialog.Controls.Add($tokenBox)
    $ok=[Windows.Forms.Button]::new()
    $ok.Text='Verify and publish once'
    $ok.Location=[Drawing.Point]::new(295,155)
    $ok.Size=[Drawing.Size]::new(205,32)
    $ok.DialogResult=[Windows.Forms.DialogResult]::OK
    $dialog.Controls.Add($ok)
    $cancel=[Windows.Forms.Button]::new()
    $cancel.Text='Cancel'
    $cancel.Location=[Drawing.Point]::new(515,155)
    $cancel.Size=[Drawing.Size]::new(105,32)
    $cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
    $dialog.Controls.Add($cancel)
    $dialog.CancelButton=$cancel
    $dialog.Add_Shown({$tokenBox.Focus()})
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'PRIVATE_PUBLICATION_CANCELLED' }
    if ($tokenBox.Text -cnotmatch '^github_pat_[A-Za-z0-9_]{20,250}$') { throw 'PRIVATE_TOKEN_INVALID' }
    Assert-PrivateFiles
    @{kind='OPERATOR_CONFIRMED_NO_APPS_OR_EXTERNAL_DEPLOYMENTS';confirmedAt=$confirmedAt} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'operator-isolation.json') -Encoding utf8
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName='C:\Users\USER\Downloads\node-v24.22.0-win-x64\node-v24.22.0-win-x64\node.exe'
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $info.ArgumentList.Add($helper)
    foreach ($name in @($info.Environment.Keys)) {
        if ($name -notin @('SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','COMSPEC')) { $null=$info.Environment.Remove($name) }
    }
    $proc=[Diagnostics.Process]::new()
    $proc.StartInfo=$info
    if (-not $proc.Start()) { throw 'PRIVATE_PUBLICATION_START_FAILED' }
    $outTask=$proc.StandardOutput.ReadToEndAsync()
    $errTask=$proc.StandardError.ReadToEndAsync()
    $proc.StandardInput.Write($tokenBox.Text)
    $proc.StandardInput.Close()
    $tokenBox.Clear()
    $dialog.Dispose()
    $dialog=$null
    $proc.WaitForExit()
    $null=$outTask.GetAwaiter().GetResult()
    $null=$errTask.GetAwaiter().GetResult()
    $message=if($proc.ExitCode -eq 0){'Publication verified. The assistant will inspect the saved receipt.'}else{'Stopped safely. Do not retry. The assistant will inspect the sanitized receipt.'}
    $null=[Windows.Forms.MessageBox]::Show($message,'Agent Workforce - publication result')
} catch {
    $safeCode=if($_.Exception.Message -cin @('PRIVATE_PUBLICATION_PREFLIGHT_STOPPED','PRIVATE_PUBLICATION_CANCELLED','PRIVATE_TOKEN_INVALID','PRIVATE_PUBLICATION_START_FAILED')){$_.Exception.Message}else{'PRIVATE_PUBLICATION_STOPPED'}
    @{status='PRIVATE_PROMPT_STOPPED';code=$safeCode} | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $PSScriptRoot 'prompt-result.json') -Encoding utf8
    $null=[Windows.Forms.MessageBox]::Show(('Stopped: '+$safeCode+'. No automatic retry.'),'Agent Workforce')
} finally {
    if($tokenBox){$tokenBox.Clear();$tokenBox.Dispose()}
    if($dialog){$dialog.Dispose()}
    if($proc){$proc.Dispose()}
}
