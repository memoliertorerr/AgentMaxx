import type { ProviderRuntime } from '../runtime'
import { ClaudeProvider } from './claude'
import { CodexProvider } from './codex'
import { CopilotProvider } from './copilot'
import { CursorProvider } from './cursor'
import { createDemoProviders } from './demo'
import { DevinProvider } from './devin'
import { GrokProvider } from './grok'
import { OllamaProvider } from './ollama'
import { OpenCodeProvider } from './opencode'
import { OpenRouterProvider } from './openrouter'
import { ZaiProvider } from './zai'

// Every provider the app ships, in default order: Claude, Codex, Cursor (the established
// three), then the rest alphabetically by display name — upstream's convention.

export function createProviders(options: { demo: boolean }): ProviderRuntime[] {
  if (options.demo) return createDemoProviders()
  return [
    new ClaudeProvider(),
    new CodexProvider(),
    new CursorProvider(),
    new CopilotProvider(),
    new DevinProvider(),
    new GrokProvider(),
    new OllamaProvider(),
    new OpenCodeProvider(),
    new OpenRouterProvider(),
    new ZaiProvider()
  ]
}
