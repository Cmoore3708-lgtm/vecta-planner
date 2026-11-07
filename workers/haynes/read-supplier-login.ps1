# Only the Haynes process receives these optional credentials. Never print them.
Remove-Item Env:HAYNES_USERNAME,Env:HAYNES_PASSWORD -ErrorAction SilentlyContinue
$loginFile=Join-Path $env:LOCALAPPDATA 'VectaHaynes\supplier-login.xml'
if (Test-Path -LiteralPath $loginFile) {
    try {
        $login=Import-Clixml -LiteralPath $loginFile -ErrorAction Stop
        if ($login -isnot [System.Management.Automation.PSCredential]) { throw 'Invalid saved login' }
        $env:HAYNES_USERNAME=$login.UserName
        $env:HAYNES_PASSWORD=$login.GetNetworkCredential().Password
    } catch { Write-Host 'Saved Haynes sign-in could not be read. Sign in in the existing Haynes window.' }
}
