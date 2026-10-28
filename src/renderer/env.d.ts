import type { AgentMaxxApi } from '../core/ipc'

declare global {
  interface Window {
    agentmaxx: AgentMaxxApi
  }
}

export {}
