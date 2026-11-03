#requires -Version 7.0
# Local-only TLS setup. Does not start the app or authorize Outreach.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Security
$answer=[Windows.Forms.MessageBox]::Show(
 'Trust a new certificate for localhost / 127.0.0.1 in THIS Windows user account only? Its private key will be protected with Windows DPAPI outside the repository. No Outreach connection or provider call will occur.',
 'Agent Workforce — local HTTPS setup',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Question)
if($answer -ne [Windows.Forms.DialogResult]::Yes){exit 0}
$dir=Join-Path $env:LOCALAPPDATA 'PrimelisSignal'
$file=Join-Path $dir 'outreach-local-tls.dpapi'
if(-not(Test-Path -LiteralPath $dir -PathType Container)){throw 'Complete the existing local application setup first.'}
if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Invalid setup directory.'}
if(Test-Path -LiteralPath $file){throw 'Existing HTTPS setup preserved; no certificate was replaced.'}
$rsa=[Security.Cryptography.RSA]::Create(2048)
$cert=$null
try {
 $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Agent Workforce Local HTTPS',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
 $san.AddDnsName('localhost');$san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
 $request.CertificateExtensions.Add($san.Build())
 $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
 $oids=[Security.Cryptography.OidCollection]::new()
 [void]$oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
 $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$true))
 $cert=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddMonths(12))
 $data=@{keyPem=$rsa.ExportPkcs8PrivateKeyPem();certPem=$cert.ExportCertificatePem()}|ConvertTo-Json -Compress
 $bytes=[Text.Encoding]::UTF8.GetBytes($data)
 try {
  $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($encrypted,0,$encrypted.Length)}finally{$stream.Dispose()}
 } finally {[Array]::Clear($bytes,0,$bytes.Length);$data=$null}
 $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root','CurrentUser')
 try {$store.Open('ReadWrite');$store.Add([Security.Cryptography.X509Certificates.X509Certificate2]::new($cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert)))}finally{$store.Close()}
 Write-Host 'Local HTTPS certificate prepared and trusted for this Windows account. No server or OAuth flow was started.'
} catch {throw 'Local certificate setup failed. Existing files were preserved; no private details are returned. Check setup before starting the app.'}
finally {$rsa.Dispose();if($cert){$cert.Dispose()}}
