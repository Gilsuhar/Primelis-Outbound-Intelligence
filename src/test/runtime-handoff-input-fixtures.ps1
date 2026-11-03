# Fictional, injected input callbacks only. Never opens UI or launches the helper.
param([switch]$TestPipelineCancellation)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\local-activation\Runtime-Handoff-Input.ps1')
if ($TestPipelineCancellation) {
    $continued = $false
    try {
        $null = Get-RuntimeHandoffPrivateInput -ConfirmIsolation { 'CONFIRMED' } -ReadMaskedToken {
            throw [System.Management.Automation.PipelineStoppedException]::new('FICTIONAL_PRIVATE_ERROR')
        }
        $continued = $true
    } finally {
        # Do not rely on the cancelled PowerShell output pipeline.
        [Console]::Out.WriteLine('{"status":"CANCELLED","continued":' + $continued.ToString().ToLowerInvariant() + ',"promptsOpened":0}')
    }
    exit
}
$cases = @(
    @{ name='missing-confirmation'; decision=$null; expected='ISOLATION_CONFIRMATION_MISSING' },
    @{ name='incorrect-confirmation'; decision='DECLINED'; expected='APP_ISOLATION_NOT_CONFIRMED' },
    @{ name='wrong-case'; decision='confirmed'; expected='APP_ISOLATION_NOT_CONFIRMED' },
    @{ name='confirmation-cancelled'; decision='CANCELLED'; expected='ISOLATION_CONFIRMATION_CANCELLED' },
    @{ name='confirmation-exception'; decision='throw'; expected='ISOLATION_CONFIRMATION_CANCELLED' },
    @{ name='token-in-confirmation'; decision='github_pat_FICTIONAL_ONLY_000000000000000000000'; expected='APP_ISOLATION_NOT_CONFIRMED' },
    @{ name='empty-token'; decision='CONFIRMED'; token='empty'; expected='TOKEN_INPUT_EMPTY' },
    @{ name='cancel-token'; decision='CONFIRMED'; token='cancel'; expected='TOKEN_INPUT_CANCELLED' },
    @{ name='null-token'; decision='CONFIRMED'; token='null'; expected='TOKEN_INPUT_CANCELLED' },
    @{ name='unmasked-token'; decision='CONFIRMED'; token='plain'; expected='TOKEN_INPUT_NOT_MASKED' },
    @{ name='invalid-token'; decision='CONFIRMED'; token='bad'; expected='TOKEN_INPUT_INVALID' },
    @{ name='valid'; decision='CONFIRMED'; token='valid'; expected='PASSED' }
)
$results = @()
foreach ($case in $cases) {
    $script:tokenReads = 0
    $script:events = @()
    $inputResult = $null
    $code = $null
    try {
        $inputResult = Get-RuntimeHandoffPrivateInput -ConfirmIsolation {
            $script:events += 'CONFIRMATION'
            if ($case.decision -ceq 'throw') { throw 'FICTIONAL_PRIVATE_ERROR' }
            return $case.decision
        } -ReadMaskedToken {
            $script:events += 'MASKED_TOKEN'
            $script:tokenReads++
            switch ($case.token) {
                'empty' { return [Security.SecureString]::new() }
                'cancel' { throw [OperationCanceledException]::new('FICTIONAL_PRIVATE_ERROR') }
                'null' { return $null }
                'plain' { return 'FICTIONAL_UNMASKED_VALUE' }
                'bad' { return (ConvertTo-SecureString 'FICTIONAL_BAD_FORMAT' -AsPlainText -Force) }
                default { return (ConvertTo-SecureString 'github_pat_FICTIONAL_ONLY_000000000000000000000' -AsPlainText -Force) }
            }
        }
        if ($inputResult.Token -isnot [Security.SecureString]) { throw 'FIXTURE_TOKEN_TYPE_FAILED' }
        $code = 'PASSED'
    } catch {
        $code = Get-RuntimeHandoffPromptCode $_.Exception.Message
    } finally {
        if ($inputResult) { $inputResult.Token.Dispose() }
    }
    $expectedReads = if ($case.decision -ceq 'CONFIRMED') { 1 } else { 0 }
    if ($code -cne $case.expected -or $script:tokenReads -ne $expectedReads) {
        # Emit only known fixture names and fixed codes, never injected input/errors.
        Write-Output ('FIXTURE_FAILED: ' + $case.name + ' / ' + $code)
        exit 1
    }
    $results += @{ name=$case.name; code=$code; tokenReads=$script:tokenReads; order=$script:events }
}
if ((Get-RuntimeHandoffPromptCode 'FICTIONAL_PRIVATE_ERROR') -cne 'PRIVATE_HANDOFF_FAILED') {
    throw 'FIXTURE_SANITIZATION_FAILED'
}
@{ status='PASSED'; cases=$results; cloudCalls=0; promptsOpened=0 } | ConvertTo-Json -Depth 5 -Compress
