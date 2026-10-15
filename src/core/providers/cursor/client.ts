import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'
import { cursorSession } from './auth'

// Cursor's Connect RPC dashboard service and cursor.com REST endpoints (upstream CursorUsageClient).

const RPC = 'https://api2.cursor.sh/aiserver.v1.DashboardService'
export const CURSOR_URLS = {
  usage: `${RPC}/GetCurrentPeriodUsage`,
  grokBot: `${RPC}/GetSandUsageStatus`,
  plan: `${RPC}/GetPlanInfo`,
  credits: `${RPC}/GetCreditGrantsBalance`,
  refresh: 'https://api2.cursor.sh/oauth/token',
  restUsage: 'https://cursor.com/api/usage',
  usageSummary: 'https://cursor.com/api/usage-summary',
  stripe: 'https://cursor.com/api/auth/stripe'
} as const

export const CURSOR_CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'

export function connectPost(ctx: ProviderContext, url: string, accessToken: string): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1'
      },
      body: '{}',
      timeoutMs: 10_000
    },
    ctx.signal
  )
}

export function refreshCursorToken(ctx: ProviderContext, refreshToken: string): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url: CURSOR_URLS.refresh,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: CURSOR_CLIENT_ID, refresh_token: refreshToken }),
      timeoutMs: 15_000
    },
    ctx.signal
  )
}

/**
 * GET with the web session cookie (`?user=<id>` when `withUser`). Undefined when the token
 * carries no usable subject.
 */
export function sessionGet(ctx: ProviderContext, url: string, accessToken: string, options: { withUser?: boolean } = {}): Promise<HttpResponse> | undefined {
  const session = cursorSession(accessToken)
  if (!session) return undefined
  const target = new URL(url)
  if (options.withUser) target.searchParams.set('user', session.userId)
  return ctx.http.request(
    { url: target.toString(), headers: { Cookie: `WorkosCursorSessionToken=${session.sessionToken}` }, timeoutMs: 10_000 },
    ctx.signal
  )
}
