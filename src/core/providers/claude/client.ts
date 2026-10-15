import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'
import type { ClaudeOAuthConfig } from './auth'

// Anthropic's OAuth usage endpoints, called exactly as Claude Code calls them (upstream
// ClaudeUsageClient). The usage endpoint checks the client surface, so the User-Agent matches.

const SCOPES = 'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const USER_AGENT = 'claude-cli/2.1.294 (external, cli)'
const OAUTH_BETA = 'oauth-2025-04-20'

export function fetchClaudeUsage(ctx: ProviderContext, config: ClaudeOAuthConfig, accessToken: string): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url: config.usageUrl,
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'anthropic-beta': OAUTH_BETA,
        'User-Agent': USER_AGENT
      },
      timeoutMs: 10_000
    },
    ctx.signal
  )
}

export function fetchClaudeProfile(ctx: ProviderContext, config: ClaudeOAuthConfig, accessToken: string): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url: config.profileUrl,
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: 'application/json',
        'anthropic-beta': OAUTH_BETA
      },
      timeoutMs: 10_000
    },
    ctx.signal
  )
}

export function refreshClaudeToken(ctx: ProviderContext, config: ClaudeOAuthConfig, refreshToken: string): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url: config.refreshUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        scope: SCOPES
      }),
      timeoutMs: 15_000
    },
    ctx.signal
  )
}
