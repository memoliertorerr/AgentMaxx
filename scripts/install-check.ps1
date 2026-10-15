# Installs UsageMaxx with the real NSIS installer (silent, per-user) and fails unless the app's program
# files are in place and built for the expected architecture. CI runs it on x64 and on Windows on ARM,
# so a broken unpack (like ARM64 program files skipped by the installer's 7-Zip decoder) can't ship.
#
#   pwsh scripts/install-check.ps1 -Installer dist\UsageMaxx-Setup-0.1.0.exe -Arch ARM64

param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][ValidateSet('x64', 'ARM64')][string]$Arch
)
$ErrorActionPreference = 'Stop'

$process = Start-Process -FilePath (Resolve-Path $Installer) -ArgumentList '/S' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)." }

$dir = Join-Path $env:LOCALAPPDATA 'Programs\UsageMaxx'
Get-ChildItem $dir | Format-Table Name, Length -AutoSize | Out-String | Write-Host

$required = 'UsageMaxx.exe', 'ffmpeg.dll', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak'
$missing = @($required | Where-Object { -not (Test-Path (Join-Path $dir $_)) })
if ($missing.Count -gt 0) { throw "Missing after install: $($missing -join ', ')" }

# The PE header's machine field: 0x8664 is x64, 0xAA64 is ARM64.
$exe = Join-Path $dir 'UsageMaxx.exe'
$bytes = [IO.File]::ReadAllBytes($exe)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
$found = switch ($machine) { 0x8664 { 'x64' } 0xAA64 { 'ARM64' } default { '0x{0:X4}' -f $machine } }
if ($found -ne $Arch) { throw "Installed UsageMaxx.exe is $found, expected $Arch." }
Write-Host "Installed $exe ($found)"
