import { useEffect, useState } from 'react'
import type { View } from '../../core/ipc'
import type { AppState } from '../../core/state'

/** The latest AppState from the main process, plus navigation requests (tray menu → Settings). */
export function useAppState(onNavigate: (view: View) => void): AppState | undefined {
  const [state, setState] = useState<AppState | undefined>(undefined)

  useEffect(() => {
    let active = true
    void window.usagemaxx.getState().then((initial) => {
      if (active) setState(initial)
    })
    const stopState = window.usagemaxx.onState(setState)
    const stopNavigate = window.usagemaxx.onNavigate(onNavigate)
    return () => {
      active = false
      stopState()
      stopNavigate()
    }
  }, [onNavigate])

  return state
}
