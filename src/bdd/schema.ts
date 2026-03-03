import type { Database } from 'better-sqlite3'

export function initSchema(db: Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS fichiers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chemin     TEXT NOT NULL UNIQUE,
      hash       TEXT NOT NULL,
      indexe_le  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fichier_id  INTEGER NOT NULL REFERENCES fichiers(id) ON DELETE CASCADE,
      chemin      TEXT NOT NULL,
      debut       INTEGER NOT NULL,
      fin         INTEGER NOT NULL,
      contenu     TEXT NOT NULL,
      langage     TEXT NOT NULL DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      contenu,
      content=chunks,
      content_rowid=id,
      tokenize='unicode61 remove_diacritics 1'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, contenu) VALUES (new.id, new.contenu);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, contenu) VALUES ('delete', old.id, old.contenu);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, contenu) VALUES ('delete', old.id, old.contenu);
      INSERT INTO chunks_fts(rowid, contenu) VALUES (new.id, new.contenu);
    END;
  `)
}
