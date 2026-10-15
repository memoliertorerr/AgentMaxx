#!/usr/bin/env node
// Launches the built app under Playwright and proves it starts. Needs a display, so it is not
// part of `npm run verify`.
//
//   node scripts/smoke-launch.mjs                 launch out/ (run `npm run build` first)
//   node scripts/smoke-launch.mjs --exe <path>    launch a packaged executable instead

import { _electron as electron } from 'playwright-core'

const args = process.argv.slice(2)
const exeIndex = args.indexOf('--exe')
const executablePath = exeIndex >= 0 ? args[exeIndex + 1] : undefined

const READY_MARKER = 'usagemaxx:ready'
const TIMEOUT_MS = 30_000

const app = await electron.launch({
  ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
  env: { ...process.env, USAGEMAXX_SMOKE: '1' },
  timeout: TIMEOUT_MS
})

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${READY_MARKER}" within ${TIMEOUT_MS} ms`)), TIMEOUT_MS)
    app.process().stdout?.on('data', (chunk) => {
      if (String(chunk).includes(READY_MARKER)) {
        clearTimeout(timer)
        resolve(undefined)
      }
    })
  })
  console.log('launched')
} finally {
  await app.close()
}
