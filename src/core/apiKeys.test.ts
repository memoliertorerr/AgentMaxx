import { describe, expect, it } from 'vitest'
import { API_KEY_PROVIDERS, MAX_API_KEY_LENGTH, apiKeyProvider, apiKeyStatus, keyFromEnvironment, normalizeApiKey } from './apiKeys'

describe('API key catalog', () => {
  it('lists OpenRouter and Z.ai with their environment fallbacks in order', () => {
    expect(API_KEY_PROVIDERS.map((provider) => [provider.id, provider.envNames])).toEqual([
      ['openrouter', ['OPENROUTER_API_KEY', 'OPENROUTER_KEY']],
      ['zai', ['ZAI_API_KEY', 'GLM_API_KEY']]
    ])
    expect(apiKeyProvider('zai')?.displayName).toBe('Z.ai')
    expect(apiKeyProvider('claude')).toBeUndefined()
    expect(apiKeyProvider(42)).toBeUndefined()
  })

  it('takes the first non-empty environment value, trimmed', () => {
    expect(keyFromEnvironment({ ZAI_API_KEY: ' ', GLM_API_KEY: ' glm \n' }, ['ZAI_API_KEY', 'GLM_API_KEY'])).toBe('glm')
    expect(keyFromEnvironment({ ZAI_API_KEY: 'zai', GLM_API_KEY: 'glm' }, ['ZAI_API_KEY', 'GLM_API_KEY'])).toBe('zai')
    expect(keyFromEnvironment({}, ['ZAI_API_KEY'])).toBeUndefined()
  })

  it('reports where the key in use comes from', () => {
    expect(apiKeyStatus(false, false)).toBe('notSet')
    expect(apiKeyStatus(false, true)).toBe('fromEnvironment')
    expect(apiKeyStatus(true, false)).toBe('saved')
    expect(apiKeyStatus(true, true)).toBe('overrideActive')
  })

  it('accepts a pasted key and rejects anything that is not one', () => {
    expect(normalizeApiKey('  sk-or-v1-abc123\n')).toBe('sk-or-v1-abc123')
    expect(normalizeApiKey('')).toBeUndefined()
    expect(normalizeApiKey('   ')).toBeUndefined()
    expect(normalizeApiKey('sk-or v1')).toBeUndefined()
    expect(normalizeApiKey('sk\u0000x')).toBeUndefined()
    expect(normalizeApiKey('x'.repeat(MAX_API_KEY_LENGTH + 1))).toBeUndefined()
    expect(normalizeApiKey(42)).toBeUndefined()
  })
})
