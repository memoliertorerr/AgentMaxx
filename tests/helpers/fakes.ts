import { FileAccessError, type FileSystem } from '../../src/core/fs'
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/core/http'
import { resolvePaths, type Env } from '../../src/core/paths'
import type { CommandResult, Logger, ProviderContext, StoredSecret } from '../../src/core/runtime'

// Test doubles for the provider context. Nothing here touches the real filesystem, network,
// credential store, or processes.

export class MemoryFileSystem implements FileSystem {
  readonly files = new Map<string, string>()
  readonly unreadable = new Set<string>()
  readonly writes: Array<{ path: string; text: string }> = []

  constructor(initial: Record<string, string> = {}) {
    for (const [file, text] of Object.entries(initial)) this.files.set(file, text)
  }

  async readText(filePath: string): Promise<string | undefined> {
    if (this.unreadable.has(filePath)) {
      throw new FileAccessError(filePath, Object.assign(new Error('denied'), { code: 'EACCES' }))
    }
    return this.files.get(filePath)
  }

  async writeTextAtomic(filePath: string, text: string): Promise<void> {
    this.writes.push({ path: filePath, text })
    this.files.set(filePath, text)
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath)
  }
}

export type Route = (request: HttpRequest) => HttpResponse | Promise<HttpResponse> | undefined

/** Answers requests from routes in order; an unmatched request fails the test loudly. */
export class FakeHttp implements HttpClient {
  readonly requests: HttpRequest[] = []
  private readonly routes: Route[] = []

  on(match: (request: HttpRequest) => boolean, respond: (request: HttpRequest) => HttpResponse): this {
    this.routes.push((request) => (match(request) ? respond(request) : undefined))
    return this
  }

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request)
    for (const route of this.routes) {
      const response = await route(request)
      if (response) return response
    }
    throw new Error(`FakeHttp: no route for ${request.method ?? 'GET'} ${request.url}`)
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers: { 'content-type': 'application/json', ...headers }, text: JSON.stringify(body) }
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} }

export interface FakeContextOptions {
  env?: Env
  platform?: string
  home?: string
  files?: Record<string, string>
  now?: Date
  secrets?: StoredSecret[]
  commands?: Record<string, CommandResult>
  apiKeys?: Record<string, string>
  http?: FakeHttp
  fs?: MemoryFileSystem
}

export interface FakeContext extends ProviderContext {
  http: FakeHttp
  fs: MemoryFileSystem
}

/** A Windows-flavored provider context by default: C:\Users\ada with standard AppData folders. */
export function fakeContext(options: FakeContextOptions = {}): FakeContext {
  const platform = options.platform ?? 'win32'
  const home = options.home ?? (platform === 'win32' ? 'C:\\Users\\ada' : '/home/ada')
  const env: Env =
    options.env ??
    (platform === 'win32'
      ? { USERPROFILE: home, APPDATA: `${home}\\AppData\\Roaming`, LOCALAPPDATA: `${home}\\AppData\\Local` }
      : { HOME: home })
  const now = options.now ?? new Date('2026-10-15T12:00:00Z')
  const secrets = options.secrets ?? []
  const commands = options.commands ?? {}
  const apiKeys = options.apiKeys ?? {}

  return {
    env,
    paths: resolvePaths({ env, homedir: home, platform }),
    http: options.http ?? new FakeHttp(),
    fs: options.fs ?? new MemoryFileSystem(options.files),
    log: silentLogger,
    now: () => now,
    signal: new AbortController().signal,
    secrets: { list: async (prefix) => secrets.filter((secret) => secret.target.startsWith(prefix)) },
    exec: {
      run: async (command, args) =>
        commands[[command, ...args].join(' ')] ?? { code: null, stdout: '', stderr: `${command}: not found` }
    },
    apiKeys: { get: async (providerId) => apiKeys[providerId] },
    manual: false
  }
}
