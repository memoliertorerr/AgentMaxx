import { describe, expect, it } from 'vitest'
import { ProviderError, httpCategory, requestFailed, toErrorInfo } from './errors'

describe('httpCategory', () => {
  it('splits rate limits, 4xx, and 5xx', () => {
    expect(httpCategory(429)).toBe('rateLimited')
    expect(httpCategory(404)).toBe('http4xx')
    expect(httpCategory(502)).toBe('http5xx')
    expect(httpCategory(302)).toBe('other')
  })
})

describe('toErrorInfo', () => {
  it('keeps a provider error’s friendly message and category', () => {
    expect(toErrorInfo(new ProviderError('notLoggedIn', 'Not logged in', 'no credentials file'))).toEqual({
      message: 'Not logged in',
      category: 'notLoggedIn',
      detail: 'no credentials file'
    })
    expect(toErrorInfo(requestFailed(500))).toMatchObject({
      message: 'Usage request failed (HTTP 500). Try again later.',
      category: 'http5xx'
    })
  })

  it('hides unexpected errors behind a generic message', () => {
    expect(toErrorInfo(new TypeError('x is undefined'))).toEqual({
      message: 'Something went wrong. Try refreshing.',
      category: 'other',
      detail: 'TypeError: x is undefined'
    })
  })
})
