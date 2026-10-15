$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'backup-config.json'
if (!(Test-Path $configPath)) { throw 'Backup is not configured. Run Install-Daily-Backup.ps1 first.' }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$secure = ConvertTo-SecureString $config.encryptedSecret
$credential = New-Object System.Management.Automation.PSCredential ('vecta-backup', $secure)
$secret = $credential.GetNetworkCredential().Password
$site = ([string]$config.siteUrl).TrimEnd('/')
$siteUri = [Uri]$site
if ($siteUri.Scheme -ne 'https' -or $siteUri.UserInfo -or $siteUri.Query -or $siteUri.Fragment -or $siteUri.AbsolutePath -ne '/') { throw 'Backup site must be an HTTPS origin without credentials or a path.' }
$folder = [string]$config.backupFolder
if (!(Test-Path $folder)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd'
$temp = Join-Path $folder "VECTA-FULL-BACKUP-$stamp.downloading"
$final = Join-Path $folder "VECTA-FULL-BACKUP-$stamp.json"
$headers = @{ Authorization = "Bearer $secret" }
try {
  Invoke-WebRequest -Uri "$site/api/full-backup" -Headers $headers -OutFile $temp -UseBasicParsing -TimeoutSec 300 -MaximumRedirection 0
  $raw = [System.IO.File]::ReadAllText($temp, [System.Text.Encoding]::UTF8)
  $json = $raw | ConvertFrom-Json
  if ($json.format -ne 'VECTA_WORKSHOP_PRO_FULL_BACKUP_V1') { throw 'The downloaded file is not a recognised VECTA backup.' }
  if ($json.consistent_snapshot -ne $true) { throw 'Backup does not contain a consistent database snapshot.' }
  $total = 0
  foreach ($entry in $json.counts.PSObject.Properties) {
    $table = $json.data.PSObject.Properties[$entry.Name]
    if ($null -eq $table) { throw "Backup table missing: $($entry.Name)" }
    $rows = @($table.Value)
    if ($rows.Count -ne [int]$entry.Value) { throw "Backup row count mismatch: $($entry.Name)" }
    $total += $rows.Count
  }
  foreach ($required in @('jobs','customers','vehicles','invoices','invoice_lines','workshop_settings','website_booking_requests')) {
    if ($null -eq $json.data.PSObject.Properties[$required]) { throw "Required backup table missing: $required" }
  }
  if ($total -ne [int]$json.total_records -or $total -lt 1) { throw 'Backup total is empty or inconsistent.' }
  # Verify the exact data JSON bytes serialized by the server, before retention.
  $match = [regex]::Match($raw, '"data"\s*:\s*\{')
  if (!$match.Success) { throw 'Backup data payload is missing.' }
  $start = $match.Index + $match.Length - 1
  $depth = 0; $inString = $false; $escaped = $false; $end = -1
  for ($i = $start; $i -lt $raw.Length; $i++) {
    $ch = $raw[$i]
    if ($inString) {
      if ($escaped) { $escaped = $false }
      elseif ($ch -eq '\') { $escaped = $true }
      elseif ($ch -eq '"') { $inString = $false }
    } else {
      if ($ch -eq '"') { $inString = $true }
      elseif ($ch -eq '{') { $depth++ }
      elseif ($ch -eq '}') { $depth--; if ($depth -eq 0) { $end = $i; break } }
    }
  }
  if ($end -lt $start) { throw 'Backup data payload is truncated.' }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw.Substring($start, $end - $start + 1))
    $digest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
  if ($digest -ne $json.data_sha256) { throw 'Backup SHA-256 checksum does not match.' }
  Move-Item -Force $temp $final
  if (![string]::IsNullOrWhiteSpace([string]$config.encryptedCopyFolder)) {
    $copyFolder = [string]$config.encryptedCopyFolder
    if (!(Test-Path $copyFolder)) { throw 'Encrypted recovery-copy folder is unavailable; previous backups retained.' }
    if (!$config.encryptedRecoveryPassphrase) { throw 'Encrypted recovery-copy passphrase is not configured.' }
    $recoverySecure = ConvertTo-SecureString $config.encryptedRecoveryPassphrase
    $recoveryCredential = New-Object System.Management.Automation.PSCredential ('recovery', $recoverySecure)
    $recoveryTool = Join-Path $PSScriptRoot '..\scripts\encrypted-workshop-backup.mjs'
    $copy = Join-Path $copyFolder ('VECTA-RECOVERY-' + (Get-Date -Format 'yyyy-MM-dd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.vecta-encrypted')
    $previousOutputEncoding = $OutputEncoding
    try {
      $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
      $recoveryCredential.GetNetworkCredential().Password | & node $recoveryTool seal $final --output $copy --passphrase-stdin
      if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery copy failed verification; previous backups retained.' }
    } finally { $OutputEncoding = $previousOutputEncoding; $recoveryCredential = $null; $recoverySecure = $null }
    Get-ChildItem -Path $copyFolder -Filter 'VECTA-RECOVERY-*.vecta-encrypted' -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 30 |
      Remove-Item -Force
  }
  Get-ChildItem -Path $folder -Filter 'VECTA-FULL-BACKUP-*.json' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30 |
    Remove-Item -Force
  "$(Get-Date -Format s) OK $($json.total_records) records -> $final" | Add-Content (Join-Path $folder 'backup-log.txt')
  exit 0
} catch {
  if (Test-Path $temp) { Remove-Item -Force $temp }
  "$(Get-Date -Format s) FAILED $($_.Exception.Message)" | Add-Content (Join-Path $folder 'backup-log.txt')
  throw
}
