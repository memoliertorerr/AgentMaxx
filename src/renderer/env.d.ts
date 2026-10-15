import type { UsageMaxxApi } from '../core/ipc'

declare global {
  interface Window {
    usagemaxx: UsageMaxxApi
  }
}

export {}
