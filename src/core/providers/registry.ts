import type { ProviderRuntime } from '../runtime'
import { createDemoProviders } from './demo'

// Every provider the app ships, in default order: Claude, Codex, Cursor (the established
// three), then the rest alphabetically by display name — upstream's convention.

export function createProviders(options: { demo: boolean }): ProviderRuntime[] {
  if (options.demo) return createDemoProviders()
  return []
}
