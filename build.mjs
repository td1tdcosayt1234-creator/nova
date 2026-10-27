import { build } from 'esbuild'
import { mkdirSync, copyFileSync } from 'node:fs'

mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  target: ['chrome120'],
  sourcemap: 'inline',
  legalComments: 'none',
  logLevel: 'info'
})

copyFileSync('src/index.html', 'dist/index.html')
copyFileSync('src/styles.css', 'dist/styles.css')
console.log('[build] renderer ok')
