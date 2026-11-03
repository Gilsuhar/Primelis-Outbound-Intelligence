# Inert functions only. No UI, credentials, files or connections are opened on import.
function Get-RuntimeHandoffPrivateInput {
    param(
        [scriptblock]$ConfirmIsolation,
        [scriptblock]$ReadMaskedToken
    )
    $privateToken = $null
    $privatePointer = [IntPtr]::Zero
    $transferred = $false
    try {
        # Confirmation is a non-editable dialog in the real launcher. Reject all
        # other values without echoing them (including accidentally supplied tokens).
        try { $decision = & $ConfirmIsolation }
        catch { throw 'ISOLATION_CONFIRMATION_CANCELLED' }
        if ($null -eq $decision -or $decision -ceq '') {
            throw 'ISOLATION_CONFIRMATION_MISSING'
        }
        if ($decision -ceq 'CANCELLED') { throw 'ISOLATION_CONFIRMATION_CANCELLED' }
        if ($decision -isnot [string] -or $decision -cne 'CONFIRMED') {
            throw 'APP_ISOLATION_NOT_CONFIRMED'
        }
        $confirmedAt = [DateTime]::UtcNow.ToString('o')

        try { $privateToken = & $ReadMaskedToken }
        catch { throw 'TOKEN_INPUT_CANCELLED' }
        if ($null -eq $privateToken) { throw 'TOKEN_INPUT_CANCELLED' }
        if ($privateToken -isnot [Security.SecureString]) { throw 'TOKEN_INPUT_NOT_MASKED' }
        if ($privateToken.Length -eq 0) { throw 'TOKEN_INPUT_EMPTY' }
        $privatePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateToken)
        # Only the Boolean format result survives; never include input in errors.
        $valid = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($privatePointer) -cmatch '^github_pat_[A-Za-z0-9_]{20,250}$'
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privatePointer)
        $privatePointer = [IntPtr]::Zero
        if (-not $valid) { throw 'TOKEN_INPUT_INVALID' }
        $transferred = $true
        return [pscustomobject]@{ Token = $privateToken; ConfirmedAt = $confirmedAt }
    }
    finally {
        if ($privatePointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privatePointer)
        }
        if (-not $transferred -and $privateToken -is [Security.SecureString]) {
            $privateToken.Dispose()
        }
    }
}

function Get-RuntimeHandoffPromptCode {
    param([string]$Message)
    # Never classify arbitrary uppercase input as a safe error message.
    $allowed = @(
        'ISOLATION_CONFIRMATION_CANCELLED', 'ISOLATION_CONFIRMATION_MISSING',
        'APP_ISOLATION_NOT_CONFIRMED', 'TOKEN_INPUT_CANCELLED', 'TOKEN_INPUT_NOT_MASKED',
        'TOKEN_INPUT_EMPTY', 'TOKEN_INPUT_INVALID', 'HANDOFF_SPEC_INVALID',
        'HANDOFF_SCRIPT_CHANGED', 'HANDOFF_START_FAILED', 'ACTIVATION_ALREADY_ATTEMPTED'
    )
    if ($Message -cin $allowed) { return $Message }
    return 'PRIVATE_HANDOFF_FAILED'
}
