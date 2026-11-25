$ErrorActionPreference = 'Stop'
$ExtensionId = 'ibnibhfjgijdeajljglggmdgnkoagldm'
$source = Join-Path $PSScriptRoot 'sycm-native-host.exe'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw '未找到 sycm-native-host.exe，请完整解压安装包后重试。' }
$installDir = Join-Path $env:LOCALAPPDATA 'SycmNativeHost'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
$hostPath = Join-Path $installDir 'sycm-native-host.exe'
Copy-Item -LiteralPath $source -Destination $hostPath -Force
$manifestPath = Join-Path $installDir 'host.json'
$manifest = @{ name = 'com.sycm.folder_picker'; description = '生意参谋目录选择'; path = $hostPath; type = 'stdio'; allowed_origins = @('chrome-extension://' + $ExtensionId + '/') }
$json = $manifest | ConvertTo-Json -Depth 3
[IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sycm.folder_picker'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath
Write-Host '安装成功。请在 Chrome 中加载扩展，并在扩展中设置保存目录。'
