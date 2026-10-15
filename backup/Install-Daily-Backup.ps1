$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'VECTA Workshop Pro - Daily Offline Backup Setup' -ForegroundColor Cyan
Write-Host 'This stores one consistent workshop-data copy per day on this Windows PC and keeps the newest 30.'
Write-Host ''
$site = Read-Host 'Workshop Pro website address (for example https://workshop.example.com)'
if ([string]::IsNullOrWhiteSpace($site)) { throw 'Website address is required.' }
$siteUri = [Uri]$site
if ($siteUri.Scheme -ne 'https' -or $siteUri.UserInfo -or $siteUri.Query -or $siteUri.Fragment -or $siteUri.AbsolutePath -ne '/') { throw 'Use an HTTPS website origin without a path.' }
$secureSecret = Read-Host 'Enter the Vercel CRON_SECRET' -AsSecureString
$encryptedSecret = ConvertFrom-SecureString $secureSecret
$defaultFolder = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'VECTA Backups'
$folder = Read-Host "Backup folder [$defaultFolder]"
if ([string]::IsNullOrWhiteSpace($folder)) { $folder = $defaultFolder }
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$copyFolder = Read-Host 'Optional encrypted recovery-copy folder (for example a private off-device sync folder; Enter to skip)'
$encryptedRecoveryPassphrase = $null
if (![string]::IsNullOrWhiteSpace($copyFolder)) {
  if ([IO.Path]::GetFullPath($copyFolder).TrimEnd('\') -eq [IO.Path]::GetFullPath($folder).TrimEnd('\')) { throw 'Choose a different folder for the recovery copy.' }
  if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is needed for encrypted recovery copies. Install the current supported Node.js LTS first.' }
  if (!(Test-Path (Join-Path $PSScriptRoot '..\scripts\encrypted-workshop-backup.mjs'))) { throw 'The recovery scripts are missing. Install the complete backup package.' }
  $recoveryPassphrase = Read-Host 'Recovery passphrase (at least 16 characters; keep a separate copy away from this PC)' -AsSecureString
  $check = New-Object System.Management.Automation.PSCredential ('recovery', $recoveryPassphrase)
  if ($check.GetNetworkCredential().Password.Length -lt 16) { throw 'Recovery passphrase must have at least 16 characters.' }
  $confirm = Read-Host 'Repeat recovery passphrase' -AsSecureString
  $confirmCheck = New-Object System.Management.Automation.PSCredential ('recovery', $confirm)
  if ($check.GetNetworkCredential().Password -cne $confirmCheck.GetNetworkCredential().Password) { throw 'Recovery passphrases do not match.' }
  $encryptedRecoveryPassphrase = ConvertFrom-SecureString $recoveryPassphrase
  $check = $null; $confirmCheck = $null
  New-Item -ItemType Directory -Force -Path $copyFolder | Out-Null
}
$config = [ordered]@{
  siteUrl = $site.TrimEnd('/')
  backupFolder = $folder
  encryptedSecret = $encryptedSecret
  encryptedCopyFolder = $copyFolder
  encryptedRecoveryPassphrase = $encryptedRecoveryPassphrase
  installedAt = (Get-Date).ToString('o')
}
$config | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $PSScriptRoot 'backup-config.json')
$runner = Join-Path $PSScriptRoot 'Run-Daily-Backup.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At 6:30pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'VECTA Workshop Daily Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily offline snapshot of VECTA workshop records' -Force | Out-Null
Write-Host ''
Write-Host 'Running the first backup now...' -ForegroundColor Yellow
& $runner
Write-Host ''
Write-Host 'SUCCESS - Daily VECTA backup is installed.' -ForegroundColor Green
Write-Host "Backups: $folder"
Write-Host 'Schedule: 6:30pm daily; if the PC is off, Windows will run it when the PC is next available.'
Write-Host 'Keep this folder private because backups contain customer and workshop data.'
if ($encryptedRecoveryPassphrase) { Write-Host 'Encrypted recovery copies are verified before retention. Check that your chosen folder actually syncs off this PC.' }
