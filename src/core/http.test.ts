import { describe, expect, it } from 'vitest'
import { ProviderError } from './errors'
import { createFetchHttpClient, fetchWithTokenRefresh, jsonObject, type HttpResponse } from './http'

const ok = (text: string, status = 200): HttpResponse => ({ status, headers: {}, text })

describe('createFetchHttpClient', () => {
  it('returns status, lower-cased headers, and text', async () => {
    const client = createFetchHttpClient(async () => new Response('{"a":1}', { status: 201, headers: { 'X-Thing': 'v' } }))
    const response = await client.request({ url: 'https://example.test/x' })
    expect(response).toEqual({ status: 201, headers: { 'content-type': 'text/plain;charset=UTF-8', 'x-thing': 'v' }, text: '{"a":1}' })
  })

  it('maps transport failures to a network error without leaking the query string', async () => {
    const client = createFetchHttpClient(async () => {
      throw new TypeError('fetch failed')
    })
    const error = await client.request({ url: 'https://example.test/usage?token=secret' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect((error as ProviderError).category).toBe('network')
    expect((error as ProviderError).detail).toBe('GET https://example.test/usage: fetch failed')
  })

  it('maps a timeout to a timeout error', async () => {
    const client = createFetchHttpClient(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const error = await client.request({ url: 'https://example.test/slow', timeoutMs: 10 }).catch((e: unknown) => e)
    expect((error as ProviderError).category).toBe('timeout')
  })
})

describe('jsonObject', () => {
  it('parses objects and rejects everything else', () => {
    expect(jsonObject(ok('{"x":2}'), 'usage')).toEqual({ x: 2 })
    expect(() => jsonObject(ok('<html>'), 'usage')).toThrow(ProviderError)
    expect(() => jsonObject(ok('[1]'), 'usage')).toThrow(/invalid/)
  })
})

describe('fetchWithTokenRefresh', () => {
  const authExpired = () => new ProviderError('authExpired', 'Session expired')

  it('returns a non-auth response untouched', async () => {
    const response = await fetchWithTokenRefresh({
      token: 'a',
      attempt: async () => ok('{}', 429),
      refreshAccessToken: async () => {
        throw new Error('should not refresh')
      },
      authExpired
    })
    expect(response.status).toBe(429)
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    const seen: string[] = []
    const response = await fetchWithTokenRefresh({
      token: 'old',
      attempt: async (token) => {
        seen.push(token)
        return token === 'old' ? ok('', 401) : ok('{}')
      },
      refreshAccessToken: async () => 'new',
      authExpired
    })
    expect(seen).toEqual(['old', 'new'])
    expect(response.status).toBe(200)
  })

  it('fails as auth-expired when the retry is still unauthorized', async () => {
    await expect(
      fetchWithTokenRefresh({ token: 'a', attempt: async () => ok('', 403), refreshAccessToken: async () => 'b', authExpired })
    ).rejects.toMatchObject({ category: 'authExpired' })
  })
})
