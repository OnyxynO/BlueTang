import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8')) as { version: string }
export const VERSION: string = pkg.version

export function afficherLogo(soustitre?: string): void {
  const cyan = '\x1b[36m'
  const bold = '\x1b[1m'
  const reset = '\x1b[0m'
  const gris = '\x1b[90m'
  console.log(`\n ${cyan}><{{{°>${reset}  ${bold}BlueTang${reset} v${VERSION}`)
  console.log(`          ${gris}${soustitre ?? 'Proxy LLM · RAG · MCP · tree-sitter'}${reset}\n`)
}
