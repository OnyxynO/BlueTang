import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import path from 'path'
import { initSchema } from './schema.js'

export type Db = InstanceType<typeof Database>

export function ouvrirBdd(cheminBdd: string): Db {
  const dossier = path.dirname(cheminBdd)
  if (!existsSync(dossier)) {
    mkdirSync(dossier, { recursive: true })
  }
  const db = new Database(cheminBdd)
  initSchema(db)
  return db
}

export function compterChunks(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) as total FROM chunks').get() as { total: number }
  return row.total
}
