export interface Config {
  port: number
  ollamaUrl: string
  modele: string
  numCtx: number
  verbose: boolean
  cheminBdd: string
}

export const configDefaut: Config = {
  port: 11435,
  ollamaUrl: 'http://localhost:11434',
  modele: 'qwen3:1.7b',
  numCtx: 16384,
  verbose: false,
  cheminBdd: '.bluetang/index.db',
}
