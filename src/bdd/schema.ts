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

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
      embedding FLOAT[768]
    );

    -- Table de liaison : rowid vec0 → chunk_id (sqlite-vec n'accepte pas rowid explicite)
    CREATE TABLE IF NOT EXISTS chunks_vec_map (
      vec_rowid INTEGER PRIMARY KEY,
      chunk_id  INTEGER NOT NULL REFERENCES chunks(id)
    );

    -- Mémoire de conversation (Phase 4)
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      cree_le     TEXT NOT NULL DEFAULT (datetime('now')),
      mis_a_jour  TEXT NOT NULL DEFAULT (datetime('now')),
      resume      TEXT,
      faits       TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS messages_session (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      contenu     TEXT NOT NULL,
      cree_le     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_id
      ON messages_session(session_id);

    CREATE INDEX IF NOT EXISTS idx_chunks_fichier_id
      ON chunks(fichier_id);
  `)
}
