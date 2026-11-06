# Loaded only in the tyre runner's process. Nothing is printed or sent to Vecta.
$espReaderLock=New-Object System.Threading.Mutex($false,'Local\VectaTyreLiveWorker')
try { $ownsEspReader=$espReaderLock.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $ownsEspReader=$true }
if (!$ownsEspReader) { throw 'The standalone tyre worker already owns the ESP profile. Close that launcher and use Workshop Connections.' }
Remove-Item Env:ESP_USERNAME,Env:ESP_PASSWORD -ErrorAction SilentlyContinue
$loginFile = Join-Path $env:LOCALAPPDATA 'VectaTyres\supplier-login.xml'
if (Test-Path -LiteralPath $loginFile) {
    try {
        $login = Import-Clixml -LiteralPath $loginFile -ErrorAction Stop
        if ($login -isnot [System.Management.Automation.PSCredential]) { throw 'Invalid saved login' }
        $env:ESP_USERNAME = $login.UserName
        $env:ESP_PASSWORD = $login.GetNetworkCredential().Password
    } catch {
        Write-Host 'ESP saved sign-in could not be read by this Windows account. Sign in in the tyre window.'
    }
}
