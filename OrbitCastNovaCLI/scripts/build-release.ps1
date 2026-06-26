$ErrorActionPreference = "Stop"

$java21 = "C:\Program Files\Android\Android Studio\jbr"
$javaExe = Join-Path $java21 "bin\java.exe"

if (-not (Test-Path $javaExe)) {
  throw "Java 21 not found at '$javaExe'. Install Android Studio or set JAVA_HOME manually."
}

$env:JAVA_HOME = $java21
$env:Path = "$($env:JAVA_HOME)\bin;$($env:Path)"

Push-Location (Join-Path $PSScriptRoot "..\android")
try {
  cmd /c gradlew.bat assembleRelease
} finally {
  Pop-Location
}

