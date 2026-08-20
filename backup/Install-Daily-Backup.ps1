$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'VECTA Workshop Pro - Daily Offline Backup Setup' -ForegroundColor Cyan
Write-Host 'This stores one full database copy per day on this Windows PC and keeps the newest 30.'
Write-Host ''
$site = Read-Host 'Workshop Pro website address (for example https://workshop.example.com)'
if ([string]::IsNullOrWhiteSpace($site)) { throw 'Website address is required.' }
$secureSecret = Read-Host 'Enter the Vercel CRON_SECRET' -AsSecureString
$encryptedSecret = ConvertFrom-SecureString $secureSecret
$defaultFolder = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'VECTA Backups'
$folder = Read-Host "Backup folder [$defaultFolder]"
if ([string]::IsNullOrWhiteSpace($folder)) { $folder = $defaultFolder }
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$config = [ordered]@{
  siteUrl = $site.TrimEnd('/')
  backupFolder = $folder
  encryptedSecret = $encryptedSecret
  installedAt = (Get-Date).ToString('o')
}
$config | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $PSScriptRoot 'backup-config.json')
$runner = Join-Path $PSScriptRoot 'Run-Daily-Backup.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At 6:30pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'VECTA Workshop Daily Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily offline copy of the VECTA Workshop Pro Supabase database' -Force | Out-Null
Write-Host ''
Write-Host 'Running the first backup now...' -ForegroundColor Yellow
& $runner
Write-Host ''
Write-Host 'SUCCESS - Daily VECTA backup is installed.' -ForegroundColor Green
Write-Host "Backups: $folder"
Write-Host 'Schedule: 6:30pm daily; if the PC is off, Windows will run it when the PC is next available.'
Write-Host 'Keep this folder private because backups contain customer and workshop data.'
