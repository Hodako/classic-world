param(
  [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$Jdk = $env:JAVA_HOME
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot

if (!$Jdk -or !(Test-Path "$Jdk\bin\javac.exe")) {
  $compiler = Get-ChildItem "$env:USERPROFILE\.gradle\jdks" -Filter javac.exe -Recurse | Select-Object -First 1
  if (!$compiler) { throw 'Set JAVA_HOME to a JDK 17 or newer.' }
  $Jdk = Split-Path (Split-Path $compiler.FullName -Parent) -Parent
}
$env:JAVA_HOME = $Jdk
Write-Host "[Build] Using JDK: $Jdk"

$tools = Join-Path $Sdk 'build-tools\35.0.0'
$platform = Join-Path $Sdk 'platforms\android-35\android.jar'
$build = Join-Path $projectRoot 'android\build'
$output = Join-Path $projectRoot 'software'
$assetsWww = Join-Path $projectRoot 'android\assets\www'

New-Item -ItemType Directory -Force "$build\classes", "$build\dex", $output, "$projectRoot\public", $assetsWww | Out-Null

function Run-Checked($exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "$exe failed ($LASTEXITCODE)" }
}

# 1. Sync full web application out/ to android/assets/www
Write-Host "[Build] Syncing web app assets from out/ to android/assets/www..."
if (Test-Path "$projectRoot\out") {
  Get-ChildItem -Path "$projectRoot\out" -Exclude software,*.zip,*.exe,*.apk | Copy-Item -Destination $assetsWww -Recurse -Force
}

$env:ANDROID_AAPT_IGNORE = "!*.svn:!*.git:!.*:!CVS:!thumbs.db:!picasa.ini:!*.scc:*~"

Write-Host "[Build] 1/7 Packaging Android resources with AAPT..."
Run-Checked "$tools\aapt.exe" @(
  'package',
  '-f',
  '-M', "$projectRoot\android\AndroidManifest.xml",
  '-S', "$projectRoot\android\res",
  '-A', "$projectRoot\android\assets",
  '-I', $platform,
  '--ignore-assets', '!*.svn:!*.git:!.*:!CVS:!thumbs.db:!picasa.ini:!*.scc:*~',
  '-F', "$build\base.apk"
)

Write-Host "[Build] 2/7 Compiling Java source files..."
$sources = @(Get-ChildItem "$projectRoot\android\src" -Filter *.java -Recurse | ForEach-Object FullName)
Run-Checked "$Jdk\bin\javac.exe" (@('-encoding', 'UTF-8', '-source', '8', '-target', '8', '-bootclasspath', $platform, '-d', "$build\classes") + $sources)

Write-Host "[Build] 3/7 Creating JAR bundle..."
Run-Checked "$Jdk\bin\jar.exe" @('cf', "$build\classes.jar", '-C', "$build\classes", '.')

Write-Host "[Build] 4/7 Converting bytecode to Dalvik Executable (classes.dex) with D8..."
Run-Checked "$tools\d8.bat" @('--min-api', '26', '--lib', $platform, '--output', "$build\dex", "$build\classes.jar")

Write-Host "[Build] 5/7 Adding DEX into APK..."
Copy-Item "$build\base.apk" "$build\unsigned.apk" -Force
Push-Location "$build\dex"
try {
  Run-Checked "$tools\aapt.exe" @('add', "$build\unsigned.apk", 'classes.dex')
} finally {
  Pop-Location
}

Write-Host "[Build] 6/7 Zip-aligning APK (4-byte boundary)..."
Run-Checked "$tools\zipalign.exe" @('-f', '4', "$build\unsigned.apk", "$build\aligned.apk")

Write-Host "[Build] 7/7 Signing APK with apksigner..."
$key = "$projectRoot\android\debug.keystore"
if (!(Test-Path $key)) {
  Run-Checked "$Jdk\bin\keytool.exe" @(
    '-genkeypair',
    '-keystore', $key,
    '-storepass', 'android',
    '-keypass', 'android',
    '-alias', 'androiddebugkey',
    '-dname', 'CN=Android Debug,O=Classic World,C=BD',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000'
  )
}

$apkName = "ClassicWorld-POS.apk"
$apkOut = "$output\$apkName"
Run-Checked "$tools\apksigner.bat" @('sign', '--ks', $key, '--ks-pass', 'pass:android', '--out', $apkOut, "$build\aligned.apk")
Run-Checked "$tools\apksigner.bat" @('verify', '--verbose', $apkOut)

# Copy to public/ downloads and root
Copy-Item $apkOut "$projectRoot\public\$apkName" -Force
Copy-Item $apkOut "$projectRoot\public\classicworld-pos.apk" -Force
Copy-Item $apkOut "$projectRoot\classic-world.apk" -Force

$item = Get-Item $apkOut
Write-Host "=========================================================="
Write-Host "[SUCCESS] Classic World Standalone One-File APK ready!"
Write-Host "File Size: $([Math]::Round($item.Length / 1MB, 2)) MB"
Write-Host "Available at:"
Write-Host "  $apkOut"
Write-Host "  $projectRoot\public\$apkName"
Write-Host "  $projectRoot\classic-world.apk"
Write-Host "=========================================================="
