# Installs UsageMaxx with the real NSIS installer (silent, per-user) and fails unless every file of the
# unpacked build arrived and UsageMaxx.exe is built for the expected architecture. CI runs it on x64 and
# on Windows on ARM, so a broken unpack (like ARM64 program files the installer skipped without an
# error) can't ship.
#
#   pwsh scripts/install-check.ps1 -Installer dist\UsageMaxx-Setup-0.1.0.exe -Expected dist\win-arm64-unpacked -Arch ARM64

param(
  [Parameter(Mandatory = $true)][string]$Installer,
  # The unpacked app electron-builder made for this architecture; every file in it must be installed.
  [Parameter(Mandatory = $true)][string]$Expected,
  [Parameter(Mandatory = $true)][ValidateSet('x64', 'ARM64')][string]$Arch
)
$ErrorActionPreference = 'Stop'

$process = Start-Process -FilePath (Resolve-Path $Installer) -ArgumentList '/S' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)." }

$dir = Join-Path $env:LOCALAPPDATA 'Programs\UsageMaxx'
Get-ChildItem $dir | Format-Table Name, Length -AutoSize | Out-String | Write-Host

$expectedRoot = (Resolve-Path $Expected).Path
$missing = @(
  Get-ChildItem $expectedRoot -Recurse -File |
    ForEach-Object { $_.FullName.Substring($expectedRoot.Length).TrimStart('\') } |
    Where-Object { -not (Test-Path (Join-Path $dir $_)) }
)
if ($missing.Count -gt 0) { throw "Missing after install ($($missing.Count)): $($missing -join ', ')" }

# The PE header's machine field: 0x8664 is x64, 0xAA64 is ARM64.
$exe = Join-Path $dir 'UsageMaxx.exe'
$bytes = [IO.File]::ReadAllBytes($exe)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
$found = switch ($machine) { 0x8664 { 'x64' } 0xAA64 { 'ARM64' } default { '0x{0:X4}' -f $machine } }
if ($found -ne $Arch) { throw "Installed UsageMaxx.exe is $found, expected $Arch." }
Write-Host "Installed every file of $Expected; $exe is $found"
