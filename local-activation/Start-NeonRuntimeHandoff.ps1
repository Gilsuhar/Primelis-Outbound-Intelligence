# Local operator entry point. Run only after a separate execution confirmation.
# RunDirectory contains a newly reviewed ready.json; no token is a parameter.
param([string]$RunDirectory = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime-Handoff-Input.ps1')
$privateInput = $null
$privatePointer = [IntPtr]::Zero
$privateProcess = $null
$validDirectory = $false
$processStarted = $false
$stopRecorded = $false
try {
    $projectDirectory = Split-Path $PSScriptRoot -Parent
    $helper = Join-Path $projectDirectory 'outputs\company-ci\runtime-handoff.cjs'
    $node = 'C:\Users\USER\Downloads\node-v24.22.0-win-x64\node-v24.22.0-win-x64\node.exe'
    if (-not [IO.Path]::IsPathFullyQualified($RunDirectory) -or
        -not (Test-Path -LiteralPath $RunDirectory -PathType Container)) {
        throw 'HANDOFF_SPEC_INVALID'
    }
    $validDirectory = $true
    if (Test-Path -LiteralPath (Join-Path $projectDirectory 'outputs\company-ci\ONE_EFFECTIVE_LOGGING_RUNTIME_20261020.started.json')) {
        throw 'ACTIVATION_ALREADY_ATTEMPTED'
    }
    $ready = Get-Content -LiteralPath (Join-Path $RunDirectory 'ready.json') -Raw | ConvertFrom-Json
    if ($ready.scope -cne 'ONE_EFFECTIVE_LOGGING_RUNTIME_20261020' -or
        $ready.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
        -not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'HANDOFF_SPEC_INVALID' }
    if ((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ready.sha256) {
        throw 'HANDOFF_SCRIPT_CHANGED'
    }

    # No editable confirmation field: pasting a token here cannot echo its text.
    Add-Type -AssemblyName System.Windows.Forms
    $privateInput = Get-RuntimeHandoffPrivateInput -ConfirmIsolation {
        $choice = [System.Windows.Forms.MessageBox]::Show(
            "STEP 1 OF 2 - ISOLATION ONLY`n`nRepository: Gilsuhar/agentworkforce-ci-acceptance`n`nConfirm that no GitHub App access has been added since your owner review. Actions must remain disabled.`n`nClick Yes only if confirmed. No/Cancel stops before requesting a token.`n`nDo not paste credentials here. The masked token prompt appears only after Yes.",
            'Agent Workforce - confirm isolated repository',
            [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
            [System.Windows.Forms.MessageBoxIcon]::Question,
            [System.Windows.Forms.MessageBoxDefaultButton]::Button3
        )
        switch ($choice) {
            ([System.Windows.Forms.DialogResult]::Yes) { return 'CONFIRMED' }
            ([System.Windows.Forms.DialogResult]::No) { return 'DECLINED' }
            default { return 'CANCELLED' }
        }
    } -ReadMaskedToken {
        Write-Host 'STEP 2 OF 2 - PRIVATE TOKEN. Input is masked; never paste it in chat.'
        Write-Host 'This repository only: Secrets write, Administration read, Webhooks read, Metadata read.'
        Write-Host 'Blank input or Ctrl+C stops. No activation starts until all preflight checks pass.'
        Read-Host 'GitHub token (masked)' -AsSecureString
    }
    # Recheck after interaction; never execute a changed helper.
    if ((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ready.sha256) {
        throw 'HANDOFF_SCRIPT_CHANGED'
    }
    @{
        kind = 'OPERATOR_CONFIRMED_NO_APP_ACCESS_CHANGE'
        confirmedAt = $privateInput.ConfirmedAt
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RunDirectory 'operator-isolation.json') -Encoding utf8

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $node
    $startInfo.WorkingDirectory = $projectDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.ArgumentList.Add($helper)
    $startInfo.ArgumentList.Add($RunDirectory)
    foreach ($name in @($startInfo.Environment.Keys)) {
        if ($name -match 'TOKEN|SECRET|PASSWORD|DATABASE|DIRECT_URL|OPENAI|HUBSPOT|OUTREACH|VERCEL|^CI_|NEON_API_KEY') {
            $startInfo.Environment.Remove($name) | Out-Null
        }
    }
    $privateProcess = [Diagnostics.Process]::new()
    $privateProcess.StartInfo = $startInfo
    if (-not $privateProcess.Start()) { throw 'HANDOFF_START_FAILED' }
    $processStarted = $true
    $privateOut = $privateProcess.StandardOutput.ReadToEndAsync()
    $privateErr = $privateProcess.StandardError.ReadToEndAsync()
    $privatePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateInput.Token)
    $privateProcess.StandardInput.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($privatePointer))
    $privateProcess.StandardInput.Close()
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privatePointer)
    $privatePointer = [IntPtr]::Zero
    $privateInput.Token.Dispose()
    $privateInput = $null
    Write-Host 'Private input delivered. Leave this window open while the guarded procedure runs.'
    $privateProcess.WaitForExit()
    $null = $privateOut.GetAwaiter().GetResult()
    $null = $privateErr.GetAwaiter().GetResult()
    if ($privateProcess.ExitCode -eq 0) {
        Write-Host 'Procedure completed. The assistant will verify the saved result.'
    } else {
        Write-Host 'Procedure STOPPED. Do not rerun. The assistant will inspect the sanitized result.'
    }
} catch {
    $code = Get-RuntimeHandoffPromptCode $_.Exception.Message
    if ($validDirectory) {
        @{ status = 'PRIVATE_PROMPT_STOPPED'; code = $code } | ConvertTo-Json |
            Set-Content -LiteralPath (Join-Path $RunDirectory 'prompt-result.json') -Encoding utf8
    }
    $stopRecorded = $true
    Write-Host ('Stopped safely: ' + $code)
} finally {
    if ($privatePointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privatePointer) }
    if ($privateInput) { $privateInput.Token.Dispose() }
    if ($privateProcess) { $privateProcess.Dispose() }
    # Ctrl+C can stop the PowerShell pipeline without entering catch. Direct
    # .NET output/file APIs still allow a fixed, credential-free cancellation receipt.
    if ($validDirectory -and -not $processStarted -and -not $stopRecorded) {
        [IO.File]::WriteAllText(
            (Join-Path $RunDirectory 'prompt-result.json'),
            '{"status":"PRIVATE_PROMPT_STOPPED","code":"PRIVATE_INPUT_CANCELLED"}',
            [Text.UTF8Encoding]::new($false)
        )
        [Console]::WriteLine('Private input cancelled. No activation was started.')
    }
}
# Deliberately no unmasked "Press Enter" prompt.
