$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'backup-config.json'
if (!(Test-Path $configPath)) { throw 'Backup is not configured. Run Install-Daily-Backup.ps1 first.' }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$secure = ConvertTo-SecureString $config.encryptedSecret
$credential = New-Object System.Management.Automation.PSCredential ('vecta-backup', $secure)
$secret = $credential.GetNetworkCredential().Password
$site = ([string]$config.siteUrl).TrimEnd('/')
$folder = [string]$config.backupFolder
if (!(Test-Path $folder)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd'
$temp = Join-Path $folder "VECTA-FULL-BACKUP-$stamp.downloading"
$final = Join-Path $folder "VECTA-FULL-BACKUP-$stamp.json"
$headers = @{ Authorization = "Bearer $secret" }
try {
  Invoke-WebRequest -Uri "$site/api/full-backup" -Headers $headers -OutFile $temp -UseBasicParsing -TimeoutSec 300
  $json = Get-Content $temp -Raw | ConvertFrom-Json
  if ($json.format -ne 'VECTA_WORKSHOP_PRO_FULL_BACKUP_V1') { throw 'The downloaded file is not a recognised VECTA backup.' }
  if ([int]$json.total_records -lt 1) { throw 'The backup contains no records.' }
  Move-Item -Force $temp $final
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
