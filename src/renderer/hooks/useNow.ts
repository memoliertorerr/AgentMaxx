import { useEffect, useState } from 'react'

/** The current time, re-read every `intervalMs` so countdowns and pace colors stay live. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
