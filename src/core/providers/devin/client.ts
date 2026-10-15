import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'
import { effectiveApiServerUrl, type DevinAuth } from './auth'

// Connect RPC GetUserStatus on the account's API server (upstream DevinUsageClient).

const CLOUD_SERVICE = 'exa.seat_management_pb.SeatManagementService'
const CLOUD_COMPAT_VERSION = '1.108.2'

export function userStatusUrl(auth: DevinAuth): string {
  return `${effectiveApiServerUrl(auth)}/${CLOUD_SERVICE}/GetUserStatus`
}

export function fetchUserStatus(ctx: ProviderContext, auth: DevinAuth): Promise<HttpResponse> {
  const body = {
    metadata: {
      apiKey: auth.apiKey,
      ideName: 'devin',
      ideVersion: CLOUD_COMPAT_VERSION,
      extensionName: 'devin',
      extensionVersion: CLOUD_COMPAT_VERSION,
      locale: 'en'
    }
  }
  return ctx.http.request(
    {
      url: userStatusUrl(auth),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
      body: JSON.stringify(body),
      timeoutMs: 15_000
    },
    ctx.signal
  )
}
