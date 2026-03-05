# Changelog

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [0.3.0] — 2026-03-04

### Ajouté
- Commande `bluetang init` — assistant de configuration interactif (@inquirer/prompts), génère `.bluetang.json` et indexe la codebase en une seule commande
- Commande `bluetang clean --index|--sessions|--all` — suppression de l'index/sessions avec sauvegarde automatique `.db.bak`
- Option `-y/--yes` sur `clean` pour bypass la confirmation (SSH, scripts CI)
- Validation Zod sur `.bluetang.json` (types, bornes, URL valide)
- Vérification du modèle Ollama au démarrage avec warning si absent
- Batching des embeddings par groupes de 20 (~5× plus rapide à l'indexation)
- `AbortSignal.timeout()` sur tous les appels `fetch()` (30s embed, 300s completions)
- Timeout 5s sur la connexion MCP
- Validation basique des args MCP contre `inputSchema.required`
- `src/utils/stopwords.ts` — stopwords partagés entre RAG et MCP
- `src/version.ts` — version lue dynamiquement depuis `package.json`
- Index SQLite sur `chunks(fichier_id)` — reindexation plus rapide
- `chmod 700` sur le dossier `.bluetang/` à la création (SEC-03)
- Fichiers < 10 octets ignorés à l'indexation
- Metadata npm complètes (author, license, repository, keywords, engines)
- Scripts `prepublishOnly` et `pretest`

### Corrigé
- Erreurs silencieuses dans `recherche.ts` et `mcp/client.ts` — loggées avec `console.error`
- Message d'erreur Ollama propagé au client dans tous les cas d'échec
- Cast `as any` supprimé dans `completions.ts`
- Validation URL Ollama dans `init` renforcée (`new URL()` + vérification protocole)

---

## [0.2.0] — 2026-02-20

### Ajouté
- Client MCP stdio (`ClientMcp`, `GestionnaireMcp`)
- Scoring de pertinence MCP par keyword matching (seuil 0.3)
- Injection des resources MCP comme contexte système
- Boucle agentique tool_calls (max 3 tours)
- Suppression des logs parasites du processus MCP enfant (`stderr: 'ignore'`)
- Endpoint `GET /stats` — métriques temps réel (index, mémoire, Ollama)
- Benchmark BM25 recall (`scripts/benchmark.ts`) — Recall@1=90%
- Chunking AST via tree-sitter (TS, JS, Python, PHP)
- README complet

---

## [0.1.0] — 2026-02-01

### Ajouté
- Proxy transparent vers Ollama (passthrough SSE streaming)
- RAG BM25 via FTS5 SQLite — indexation, chunking heuristique, recherche
- RAG sémantique via sqlite-vec + nomic-embed-text (768 dim)
- Recherche hybride BM25 + cosinus (pondération 0.4/0.6, seuil 0.35)
- Watcher temps réel (chokidar)
- Mémoire de conversation — sessions SQLite, résumé progressif, extraction de faits regex
- CLI : `serve`, `index`, `watch`, `status`
- Configuration via `.bluetang.json`
- Tests unitaires et d'intégration (Vitest)
