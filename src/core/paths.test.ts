import { describe, expect, it } from 'vitest'
import { envDirectory, resolvePaths } from './paths'

const windows = (env: Record<string, string>) =>
  resolvePaths({ env, homedir: 'C:\\Users\\fallback', platform: 'win32' })

describe('resolvePaths on Windows', () => {
  it('uses USERPROFILE, APPDATA, and LOCALAPPDATA', () => {
    const paths = windows({
      USERPROFILE: 'C:\\Users\\ada',
      APPDATA: 'C:\\Users\\ada\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local'
    })
    expect(paths.isWindows).toBe(true)
    expect(paths.home).toBe('C:\\Users\\ada')
    expect(paths.appData).toBe('C:\\Users\\ada\\AppData\\Roaming')
    expect(paths.localAppData).toBe('C:\\Users\\ada\\AppData\\Local')
    expect(paths.join(paths.home, '.claude', '.credentials.json')).toBe('C:\\Users\\ada\\.claude\\.credentials.json')
  })

  it('derives AppData folders from the home folder when the variables are missing', () => {
    const paths = windows({ USERPROFILE: 'D:\\Profiles\\ada' })
    expect(paths.appData).toBe('D:\\Profiles\\ada\\AppData\\Roaming')
    expect(paths.localAppData).toBe('D:\\Profiles\\ada\\AppData\\Local')
  })

  it('falls back to os.homedir() when USERPROFILE is unset or blank', () => {
    expect(windows({ USERPROFILE: '  ' }).home).toBe('C:\\Users\\fallback')
  })

  it('expands ~ with either separator', () => {
    const paths = windows({ USERPROFILE: 'C:\\Users\\ada' })
    expect(paths.expand('~/.codex')).toBe('C:\\Users\\ada\\.codex')
    expect(paths.expand('~\\.codex')).toBe('C:\\Users\\ada\\.codex')
    expect(paths.expand('E:/tools/codex')).toBe('E:\\tools\\codex')
  })
})

describe('resolvePaths elsewhere', () => {
  it('maps to Application Support on macOS', () => {
    const paths = resolvePaths({ env: { HOME: '/Users/ada' }, homedir: '/Users/x', platform: 'darwin' })
    expect(paths.isWindows).toBe(false)
    expect(paths.appData).toBe('/Users/ada/Library/Application Support')
  })

  it('honors XDG folders on Linux', () => {
    const paths = resolvePaths({
      env: { HOME: '/home/ada', XDG_CONFIG_HOME: '/cfg', XDG_DATA_HOME: '/data' },
      homedir: '/home/x',
      platform: 'linux'
    })
    expect(paths.appData).toBe('/cfg')
    expect(paths.localAppData).toBe('/data')
  })
})

describe('envDirectory', () => {
  const paths = windows({ USERPROFILE: 'C:\\Users\\ada' })

  it('uses CLAUDE_CONFIG_DIR when set', () => {
    expect(envDirectory(paths, { CLAUDE_CONFIG_DIR: 'D:\\claude' }, 'CLAUDE_CONFIG_DIR', '.claude')).toBe('D:\\claude')
  })

  it('expands ~ in CODEX_HOME', () => {
    expect(envDirectory(paths, { CODEX_HOME: '~/codex-work' }, 'CODEX_HOME', '.codex')).toBe(
      'C:\\Users\\ada\\codex-work'
    )
  })

  it('falls back to the home default when unset', () => {
    expect(envDirectory(paths, {}, 'CODEX_HOME', '.codex')).toBe('C:\\Users\\ada\\.codex')
  })
})
