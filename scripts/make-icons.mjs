#!/usr/bin/env node
// Renders the app icon from the same mark the tray icon draws when nothing is pinned
// (src/main/trayIcon.ts), so the installer, the .exe, and the tray share one design. No upstream
// artwork. The output is committed; rerun after changing the mark:
//
//   node scripts/make-icons.mjs      writes build/icon.png (256 px) and build/icon.ico
//                                    (16/24/32/48/64/256, PNG-in-ICO)
//
// The TypeScript sources are loaded through Vite's module runner (vite is already a dev
// dependency), so the encoders aren't duplicated here.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runnerImport } from 'vite'

const ICO_SIZES = [16, 24, 32, 48, 64, 256]
const outDir = path.resolve('build')

const { module: tray } = await runnerImport(path.resolve('src/main/trayIcon.ts'))
const { module: ico } = await runnerImport(path.resolve('src/core/ico.ts'))

mkdirSync(outDir, { recursive: true })
const mark = (size) => tray.renderTrayIcon([], size)
writeFileSync(path.join(outDir, 'icon.png'), mark(256))
writeFileSync(path.join(outDir, 'icon.ico'), ico.encodeIco(ICO_SIZES.map((size) => ({ size, png: mark(size) }))))
console.log(`wrote ${path.relative(process.cwd(), outDir)}/icon.png and icon.ico (${ICO_SIZES.join(', ')} px)`)
