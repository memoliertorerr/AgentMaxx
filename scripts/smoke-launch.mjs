#!/usr/bin/env node
// Launches the app under Playwright and proves it starts. Needs a display, so it is not part of
// `npm run verify`.
//
//   node scripts/smoke-launch.mjs                       launch out/ (run `npm run build` first)
//   node scripts/smoke-launch.mjs --exe <path>          launch a packaged executable instead
//   node scripts/smoke-launch.mjs --screenshot          open the popup with demo data and save
//                                                       test-results/popup-demo.png
//   node scripts/smoke-launch.mjs --screenshot --theme dark --name popup-dark
//   node scripts/smoke-launch.mjs --screenshot --scroll-bottom   also capture the end of the list
//   node scripts/smoke-launch.mjs --screenshot --expand          open the first card's caret first
//
// Every run uses a fresh profile under test-results/, so screenshots are reproducible and the
// real user profile is never touched.

import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const executablePath = option('--exe')
const screenshot = args.includes('--screenshot')
const theme = option('--theme')
const view = option('--view')
const name = option('--name') ?? (theme ? `popup-${theme}` : 'popup-demo')

const READY_MARKER = 'usagemaxx:ready'
const TIMEOUT_MS = 60_000
const SETTLE_MS = 1500

const resultsDir = path.resolve('test-results')
const profileDir = path.join(resultsDir, `smoke-profile-${name}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(profileDir, { recursive: true })

const env = {
  ...process.env,
  USAGEMAXX_SMOKE: '1',
  USAGEMAXX_USER_DATA: profileDir,
  ...(screenshot ? { USAGEMAXX_DEMO: '1', USAGEMAXX_SMOKE_SHOW: '1' } : {}),
  ...(theme ? { USAGEMAXX_THEME: theme } : {}),
  ...(view ? { USAGEMAXX_SMOKE_VIEW: view } : {})
}

const app = await electron.launch({
  ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
  env,
  // Playwright emulates a light color scheme unless told otherwise.
  colorScheme: theme === 'dark' ? 'dark' : 'light',
  timeout: TIMEOUT_MS
})

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${READY_MARKER}" within ${TIMEOUT_MS} ms`)), TIMEOUT_MS)
    const onData = (chunk) => {
      if (String(chunk).includes(READY_MARKER)) {
        clearTimeout(timer)
        resolve(undefined)
      }
    }
    app.process().stdout?.on('data', onData)
  })
  console.log('launched')

  if (screenshot) {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-ready="true"]', { timeout: TIMEOUT_MS })
    // Let the demo providers finish their first refresh and the popup settle at its final size.
    await page.waitForTimeout(SETTLE_MS)
    if (args.includes('--expand')) {
      await page.locator('.caret').first().click()
      await page.waitForTimeout(300)
    }
    const file = path.join(resultsDir, `${name}.png`)
    await page.screenshot({ path: file })
    console.log(`screenshot: ${path.relative(process.cwd(), file)}`)
    if (args.includes('--scroll-bottom')) {
      await page.evaluate(() => {
        const scroller = document.querySelector('.scroll')
        if (scroller) scroller.scrollTop = scroller.scrollHeight
      })
      await page.waitForTimeout(200)
      const bottom = path.join(resultsDir, `${name}-bottom.png`)
      await page.screenshot({ path: bottom })
      console.log(`screenshot: ${path.relative(process.cwd(), bottom)}`)
    }
  }
} finally {
  await app.close()
}
