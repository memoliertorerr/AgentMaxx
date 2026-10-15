import { execFile } from 'node:child_process'
import { parseCredentialLines } from '../core/credentialManager'
import type { Logger, SecretStore } from '../core/runtime'

// Reads generic credentials from Windows Credential Manager (where gh and other tools keep
// tokens) with a small C# CredEnumerate call through PowerShell — no native module. The output
// carries secrets, so it's parsed and never logged. Off Windows this store is always empty.

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$prefix = $env:USAGEMAXX_CRED_PREFIX
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class UsageMaxxCredentials {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredEnumerateW(string filter, int flags, out int count, out IntPtr credentials);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr buffer);
}
"@
$count = 0
$list = [IntPtr]::Zero
if ([UsageMaxxCredentials]::CredEnumerateW($prefix + '*', 0, [ref]$count, [ref]$list)) {
  try {
    for ($i = 0; $i -lt $count; $i++) {
      $pointer = [Runtime.InteropServices.Marshal]::ReadIntPtr($list, $i * [IntPtr]::Size)
      $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][UsageMaxxCredentials+CREDENTIAL])
      $bytes = New-Object byte[] $credential.CredentialBlobSize
      if ($credential.CredentialBlobSize -gt 0) {
        [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $credential.CredentialBlobSize)
      }
      [pscustomobject]@{ target = $credential.TargetName; user = $credential.UserName; blob = [Convert]::ToBase64String($bytes) } | ConvertTo-Json -Compress
    }
  } finally {
    [UsageMaxxCredentials]::CredFree($list)
  }
}
`

const TIMEOUT_MS = 15_000
/** Credential target prefixes are plain identifiers ("gh:github.com:"); nothing else is passed. */
const SAFE_PREFIX = /^[\w:.@-]+$/

export function createWindowsSecretStore(log: Logger): SecretStore {
  return {
    async list(prefix) {
      if (process.platform !== 'win32') return []
      if (!SAFE_PREFIX.test(prefix)) throw new Error('invalid credential prefix')
      const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
      return new Promise((resolve) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
          {
            timeout: TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            env: { ...process.env, USAGEMAXX_CRED_PREFIX: prefix }
          },
          (error, stdout) => {
            if (error) {
              // stderr can't contain the secrets (they only go to stdout), but keep the log minimal.
              log.warn('credentials', `Credential Manager read failed (${error.code ?? error.name})`)
              resolve([])
              return
            }
            resolve(parseCredentialLines(String(stdout)))
          }
        )
      })
    }
  }
}
