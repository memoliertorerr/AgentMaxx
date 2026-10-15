import type { ProviderContext, ProviderRuntime } from './runtime'

// First-run detection (upstream provider-enablement.md): ask every provider whether its sign-in
// is on this PC. Local only — files, the credential store, saved keys, environment variables —
// never the network. A probe that throws or hangs counts as "not found".

export const DETECT_TIMEOUT_MS = 10_000

async function probe(provider: ProviderRuntime, ctx: ProviderContext, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      ctx.log.warn('detect', `${provider.info.id}: credential check timed out`)
      resolve(false)
    }, timeoutMs)
  })
  try {
    return await Promise.race([provider.hasLocalCredentials(ctx).catch((error: unknown) => {
      ctx.log.warn('detect', `${provider.info.id}: credential check failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Which providers have local credentials, by id. Probes run in parallel. */
export async function detectLocalCredentials(
  providers: readonly ProviderRuntime[],
  ctx: ProviderContext,
  timeoutMs = DETECT_TIMEOUT_MS
): Promise<Record<string, boolean>> {
  const results = await Promise.all(providers.map(async (provider) => [provider.info.id, await probe(provider, ctx, timeoutMs)] as const))
  return Object.fromEntries(results)
}
