# BlueTang — Spécification technique

> Ce fichier documente les **décisions techniques retenues**, y compris les écarts par rapport aux specs initiales (`../../_specs/BlueTang/SPECS.md`).

---

## Stack définitive

| Composant | Choix retenu | Alternative écartée | Raison |
|-----------|-------------|---------------------|--------|
| Langage | TypeScript 5 strict + Node.js 22 ESM | Python, Rust | Apprentissage JS/TS, écosystème, vitesse de dev |
| Serveur HTTP | Hono + @hono/node-server | Express, Fastify | Léger, streaming Web API natif, bon DX |
| Stockage vecteurs | **sqlite-vec** | ~~LanceDB~~ | Bindings natifs plus stables, tout-en-un avec SQLite |
| Stockage relationnel | better-sqlite3 | — | Synchrone, performant, bindings C natifs |
| Recherche textuelle | SQLite FTS5 (intégré) | Lunr, MiniSearch | Zéro dépendance, BM25 natif |
| Chunking Phase 2-4 | **Heuristique regex** | ~~tree-sitter AST~~ | Plus simple pour commencer, tree-sitter en Phase 5 |
| Recherche Phase 3+ | **Hybrid BM25 + sémantique** | BM25 seul, sémantique seul | Meilleurs résultats sur le code |
| CLI | Commander.js | yargs, meow | Standard de facto |
| Tests | Vitest | Jest | Rapide, ESM natif |
| Build | tsup | esbuild direct, tsc | Simple, shebang préservé |

---

## Architecture — flux d'une requête (Phase 2+)

```
POST /v1/chat/completions
         |
         ▼
   [Router Hono]
         |
         +---------------------+
         ▼                     ▼
  [RAG — Phase 2+]    [Mémoire — Phase 4+]
  embed question       charger résumé session
  FTS5 + sqlite-vec    + faits clés
  top-K chunks
         |                     |
         +----------+----------+
                    ▼
          [Assembleur de prompt]
          system: instructions
          system: faits clés
          system: résumé session
          messages: derniers N
          system: chunks RAG      ← juste avant la question
          user: question courante
                    |
                    ▼
             [Ollama :11434]
                    |
                    ▼ (stream SSE)
             [Post-traitement]     ← Phase 4 : capture + mise à jour mémoire
                    |
                    ▼
                 Client
```

---

## Stockage SQLite — schéma cible (Phase 2+)

```sql
-- Chunks de code indexés
CREATE TABLE chunks (
  id        INTEGER PRIMARY KEY,
  fichier   TEXT NOT NULL,
  langage   TEXT NOT NULL,
  type      TEXT NOT NULL,    -- 'fonction' | 'classe' | 'bloc' | 'texte'
  nom       TEXT,             -- nom de la fonction/classe si applicable
  ligne_debut INTEGER NOT NULL,
  ligne_fin   INTEGER NOT NULL,
  contenu   TEXT NOT NULL,
  hash      TEXT NOT NULL,    -- SHA-256 du contenu (détection changements)
  indexe_le TEXT NOT NULL
);

-- Index FTS5 pour BM25 (Phase 2)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  contenu, fichier, nom,
  content='chunks', content_rowid='id'
);

-- Vecteurs pour recherche sémantique (Phase 3, via sqlite-vec)
-- table gérée par sqlite-vec

-- Sessions de conversation (Phase 4)
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,   -- hash des premiers messages
  cree_le    TEXT NOT NULL,
  mis_a_jour TEXT NOT NULL,
  resume     TEXT DEFAULT '',    -- résumé progressif
  faits      TEXT DEFAULT '[]'   -- JSON array de faits clés
);

CREATE TABLE messages (
  id         INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role       TEXT NOT NULL,      -- 'user' | 'assistant'
  contenu    TEXT NOT NULL,
  cree_le    TEXT NOT NULL
);
```

---

## Budget tokens (Phase 2+)

Pour `numCtx = 16384` :

| Zone | Budget | Contenu |
|------|--------|---------|
| System instructions | ~500 | Identité + comportement |
| Faits clés (Phase 4) | ~600 | Décisions, fichiers mentionnés |
| Résumé session (Phase 4) | ~1200 | Historique compressé |
| Derniers messages | ~3000 | 6-8 messages verbatim |
| Chunks RAG | ~5500 | Code pertinent |
| Réserve réponse | ~2048 | Espace pour la réponse |
| Marge sécurité | ~2536 | Buffer |

Pondération recherche hybrid (Phase 3) :
```
score_final = 0.4 × score_bm25 + 0.6 × score_cosinus
```

---

## Chunking heuristique (Phase 2)

Découpage par frontières sémantiques détectées par regex, sans parsing AST :

```
Séparateurs par langue :
  TypeScript/JS : lignes commençant par function|class|const \w+ =|export
  Python        : lignes commençant par def |class
  PHP           : lignes commençant par function |class
  Autres        : blocs séparés par 2+ lignes vides (fallback universel)
```

Taille cible par chunk : 400-600 tokens. Les chunks trop gros sont redécoupés aux lignes vides suivantes.

**Tree-sitter AST** (Phase 5) : remplacera cet heuristique pour un découpage syntaxiquement correct sur 10+ langages.

---

## Chunking sémantique AST (Phase 5 — tree-sitter)

Voir `../../_specs/BlueTang/SPECS.md` §5 pour l'algorithme complet.

Langages prioritaires pour Phase 5 : TypeScript, JavaScript, Python, PHP.

---

## Gestion des sessions (Phase 4)

- **Identifiant** : SHA-256 des 3 premiers messages utilisateur (best-effort)
- **Seuil de compression** : 10 messages → résumé des anciens, conservation des 8 derniers verbatim
- **Résumé** : même modèle Ollama (pas de swap — coût 2-5s inacceptable)
- **Extraction de faits** : heuristiques regex, pas de LLM (vitesse)
- **Imperfection acceptée** : sessions sans ID custom peuvent se mélanger dans des cas rares

---

## Décisions écartées

| Décision | Raison de l'écart |
|----------|-------------------|
| Modèle séparé pour résumé | Swap Ollama = 2-5s, impossible avec 16 Go RAM |
| LanceDB | Bindings Node.js moins stables que sqlite-vec pour le MVP |
| tree-sitter dès Phase 2 | Complexité inutile avant de valider le RAG end-to-end |
| Plugin Continue.dev (au lieu de proxy) | Proxy = universel, fonctionne avec tous les clients OpenAI-compat |
| BM25 seul | Hybrid = meilleurs résultats, FTS5 SQLite rend BM25 gratuit de toute façon |
