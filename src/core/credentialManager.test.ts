import { describe, expect, it } from 'vitest'
import { decodeCredentialBlob, parseCredentialLines, unwrapGoKeyring } from './credentialManager'

describe('decodeCredentialBlob', () => {
  it('reads UTF-8 and UTF-16LE blobs', () => {
    expect(decodeCredentialBlob(Buffer.from('gho_abc123', 'utf8'))).toBe('gho_abc123')
    expect(decodeCredentialBlob(Buffer.from('gho_abc123', 'utf16le'))).toBe('gho_abc123')
  })
})

describe('unwrapGoKeyring', () => {
  it('decodes the go-keyring prefix and passes plain values through', () => {
    const wrapped = `go-keyring-base64:${Buffer.from('gho_token').toString('base64')}`
    expect(unwrapGoKeyring(wrapped)).toBe('gho_token')
    expect(unwrapGoKeyring('  gho_plain \n')).toBe('gho_plain')
    expect(unwrapGoKeyring('   ')).toBeUndefined()
  })
})

describe('parseCredentialLines', () => {
  it('parses one JSON object per line and skips noise', () => {
    const blob = Buffer.from('secret', 'utf8').toString('base64')
    const stdout = [
      'Some PowerShell banner',
      JSON.stringify({ target: 'gh:github.com:ada', user: 'ada', blob }),
      '{not json',
      JSON.stringify({ target: 'gh:github.com:', blob })
    ].join('\r\n')
    expect(parseCredentialLines(stdout)).toEqual([
      { target: 'gh:github.com:ada', userName: 'ada', secret: 'secret' },
      { target: 'gh:github.com:', secret: 'secret' }
    ])
  })
})
