import path from 'node:path'

// Path resolution takes the environment as input, so Windows paths can be unit-tested on any
// host: `path.win32` / `path.posix` are chosen from the injected platform, not the real one.

export type Env = Readonly<Record<string, string | undefined>>

export interface PathInputs {
  env: Env
  homedir: string
  platform: string
}

export interface ResolvedPaths {
  platform: string
  isWindows: boolean
  /** %USERPROFILE% on Windows, $HOME elsewhere. */
  home: string
  /** %APPDATA% (Roaming) on Windows. */
  appData: string
  /** %LOCALAPPDATA% on Windows. */
  localAppData: string
  join: (...parts: string[]) => string
  /** Expands a leading `~` to the home directory and normalizes separators. */
  expand: (value: string) => string
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function resolvePaths({ env, homedir, platform }: PathInputs): ResolvedPaths {
  const isWindows = platform === 'win32'
  const p = isWindows ? path.win32 : path.posix
  const home = (isWindows ? nonEmpty(env.USERPROFILE) : nonEmpty(env.HOME)) ?? homedir

  let appData: string
  let localAppData: string
  if (isWindows) {
    appData = nonEmpty(env.APPDATA) ?? p.join(home, 'AppData', 'Roaming')
    localAppData = nonEmpty(env.LOCALAPPDATA) ?? p.join(home, 'AppData', 'Local')
  } else if (platform === 'darwin') {
    appData = p.join(home, 'Library', 'Application Support')
    localAppData = appData
  } else {
    appData = nonEmpty(env.XDG_CONFIG_HOME) ?? p.join(home, '.config')
    localAppData = nonEmpty(env.XDG_DATA_HOME) ?? p.join(home, '.local', 'share')
  }

  const expand = (value: string): string => {
    if (value === '~') return home
    if (value.startsWith('~/') || value.startsWith('~\\')) return p.join(home, value.slice(2))
    return p.normalize(value)
  }

  return { platform, isWindows, home, appData, localAppData, join: (...parts) => p.join(...parts), expand }
}

/**
 * A directory a tool lets users relocate with an environment variable (CLAUDE_CONFIG_DIR,
 * CODEX_HOME, …): the variable's value when set, else the default under the home folder.
 */
export function envDirectory(paths: ResolvedPaths, env: Env, variable: string, ...fallback: string[]): string {
  const override = nonEmpty(env[variable])
  return override ? paths.expand(override) : paths.join(paths.home, ...fallback)
}
