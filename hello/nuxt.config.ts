import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Descobre submódulos locais em ./modules (portável para o GitHub). */
function discoverLocalModules() {
  const root = dirname(fileURLToPath(import.meta.url))
  const dir = join(root, 'modules')
  if (!existsSync(dir)) return [] as string[]

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      existsSync(join(dir, entry.name, 'nuxt.config.ts'))
      || existsSync(join(dir, entry.name, 'nuxt.config.js')),
    )
    .map((entry) => `./modules/${entry.name}`)
    .sort()
}

export default defineNuxtConfig({
  extends: discoverLocalModules(),
})
