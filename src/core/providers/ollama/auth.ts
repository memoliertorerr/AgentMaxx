import { ProviderError } from '../../errors'
import { FileAccessError } from '../../fs'
import type { ProviderContext } from '../../runtime'
import { parseOpenSshEd25519, type OllamaSigningKey } from './openssh'

// The ed25519 key Ollama writes to %USERPROFILE%\.ollama\id_ed25519 on first run and links to an
// ollama.com account on `ollama signin` (upstream OllamaAuthStore). It's the whole credential.

export const ollamaAuthError = {
  missingKey: () => new ProviderError('notLoggedIn', 'No Ollama key found. Install Ollama and run `ollama signin` to track cloud usage.'),
  keyUnreadable: (detail?: string) =>
    new ProviderError('credentialAccess', "Couldn't read %USERPROFILE%\\.ollama\\id_ed25519. Check the file's permissions.", detail),
  invalidKey: () => new ProviderError('authInvalid', "%USERPROFILE%\\.ollama\\id_ed25519 isn't a usable Ollama signing key."),
  notSignedIn: () => new ProviderError('notLoggedIn', 'Not signed in to Ollama Cloud. Run `ollama signin` to see usage.')
}

export function ollamaKeyPath(ctx: ProviderContext): string {
  return ctx.paths.join(ctx.paths.home, '.ollama', 'id_ed25519')
}

/** The signing key, or undefined when Ollama isn't installed. A broken key file throws. */
export async function loadSigningKey(ctx: ProviderContext): Promise<OllamaSigningKey | undefined> {
  let pem: string | undefined
  try {
    pem = await ctx.fs.readText(ollamaKeyPath(ctx))
  } catch (error) {
    if (error instanceof FileAccessError) throw ollamaAuthError.keyUnreadable(`${error.code ?? 'error'} reading the key`)
    throw error
  }
  if (!pem?.trim()) return undefined
  const key = parseOpenSshEd25519(pem)
  if (!key) throw ollamaAuthError.invalidKey()
  return key
}
