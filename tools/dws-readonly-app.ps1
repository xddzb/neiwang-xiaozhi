param([ValidateSet('Configure','Login')][string]$Mode='Configure')
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
$taskData=if($env:NEIWANG_DATA_DIR){$env:NEIWANG_DATA_DIR}else{Join-Path $appRoot 'data'}
$credentialFile=Join-Path $taskData 'config/dws-readonly-app.xml'
if($Mode -eq 'Configure'){
 Write-Host 'Use a separate AI-table application. Do not reuse the robot app.'
 Write-Host 'Verify its permission list contains only necessary identity and AI-table READ permissions.'
 Write-Host 'If the backend offers only read/write combined permissions, STOP; do not grant them.'
 $review=Read-Host 'After verifying the backend permissions, type READONLY to save local credentials'
 if($review -cne 'READONLY'){throw 'Permission review not confirmed; nothing saved.'}
 $appId=Read-Host 'Dedicated application Client ID / AppKey'
 if([string]::IsNullOrWhiteSpace($appId)){throw 'Client ID is required.'}
 $appSecret=Read-Host 'Dedicated application Client Secret (hidden)' -AsSecureString
 if($appSecret.Length -eq 0){throw 'Client Secret is required.'}
 New-Item -ItemType Directory -Path (Split-Path $credentialFile -Parent) -Force | Out-Null
 [pscredential]::new($appId.Trim(),$appSecret) | Export-Clixml -LiteralPath $credentialFile
 Write-Host 'Saved using Windows user-bound encryption. Return to the app and click Login.'
 exit 0
}
if(!(Test-Path -LiteralPath $credentialFile)){throw 'Configure the dedicated read-only application first.'}
$appCredential=Import-Clixml -LiteralPath $credentialFile
if($appCredential -isnot [pscredential]){throw 'Invalid application credential file.'}
Get-ChildItem Env:DWS_* | ForEach-Object {Remove-Item -LiteralPath ('Env:'+ $_.Name)}
$env:DWS_CONFIG_DIR=Join-Path $taskData 'dws-readonly/config'
$env:DWS_KEYCHAIN_DIR=Join-Path $taskData 'dws-readonly/keychain'
$env:DWS_NO_UPDATE_CHECK='1'
$env:DWS_LANG='zh'
$env:DWS_CLIENT_ID=$appCredential.UserName
$env:DWS_CLIENT_SECRET=$appCredential.GetNetworkCredential().Password
try{
 Write-Host 'Review the authorization page yourself. Stop if it asks for unrelated or write permissions.'
 & (Join-Path $appRoot 'extensions/dws/dws.exe') auth login
 $loginExit=$LASTEXITCODE
 if($loginExit -eq 0){Write-Host 'Return to AI-table settings and refresh login status.'}
 exit $loginExit
}finally{Remove-Item Env:DWS_CLIENT_SECRET -ErrorAction SilentlyContinue;Remove-Item Env:DWS_CLIENT_ID -ErrorAction SilentlyContinue}
