import type { FileSystem } from './fs'
import type { Logger } from './runtime'
import { defaultSettings, normalizeSettings, type Settings } from './settings'

/** Reads and writes settings.json. A missing or corrupt file yields defaults, never a crash. */
export class SettingsStore {
  constructor(
    private readonly fs: FileSystem,
    private readonly filePath: string,
    private readonly log: Logger
  ) {}

  async load(): Promise<Settings> {
    let text: string | undefined
    try {
      text = await this.fs.readText(this.filePath)
    } catch (error) {
      this.log.error('settings', `couldn't read settings, using defaults: ${String(error)}`)
      return defaultSettings()
    }
    if (text === undefined) return defaultSettings()
    try {
      return normalizeSettings(JSON.parse(text))
    } catch {
      this.log.error('settings', 'settings file is not valid JSON; replacing it with defaults')
      const defaults = defaultSettings()
      await this.save(defaults)
      return defaults
    }
  }

  async save(settings: Settings): Promise<void> {
    await this.fs.writeTextAtomic(this.filePath, JSON.stringify(settings, null, 2))
  }
}
