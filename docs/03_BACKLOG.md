# BlueTang — Backlog

> Roadmap par phases. Cocher au fil de l'implémentation.
> Critère de passage à la phase suivante : le critère de la phase courante est atteint et validé manuellement.

---

## Phase 1 — Proxy transparent ✅

**Critère** : le proxy est invisible — Continue.dev fonctionne comme si le client parlait directement à Ollama.

- [x] Setup projet (TypeScript, Vitest, tsup, Commander)
- [x] Serveur Hono avec `POST /v1/chat/completions` en passthrough
- [x] Streaming SSE fonctionnel (pipe direct du flux Ollama)
- [x] `GET /v1/models` et `GET /health`
- [x] `POST /v1/embeddings` passthrough
- [x] CLI `serve` avec options port, ollama-url, model, num-ctx, verbose
- [x] 7 tests Vitest (nominal + erreurs)
- [x] CLAUDE.md + docs/

**Validation manuelle** : pointer Continue.dev sur `:11435`, vérifier qu'une conversation fonctionne normalement.

---

## Phase 2 — Indexation + RAG BM25 ✅

**Critère** : poser "Que fait la fonction X ?" et obtenir une réponse basée sur le bon fichier.

**Pourquoi BM25 d'abord** : pas besoin d'Ollama pour les embeddings, itération rapide, bon pour les noms exacts.

- [x] Schéma SQLite : tables `chunks`, `chunks_fts` (FTS5)
- [x] Chunking heuristique (regex par langage : TS/JS, Python, PHP, fallback universel)
- [x] Pipeline d'indexation : scan fichiers → filtre `.gitignore` → détection changements (hash) → chunks → FTS5
- [x] CLI `index [chemin]` avec progression
- [x] Recherche BM25 : FTS5 → top-K → sélection par budget tokens (~2000 tokens)
- [x] Assembleur de prompt : injecter les chunks en message `system` juste avant la question
- [x] Interception `POST /v1/chat/completions` : enrichir les messages avant forward
- [x] CLI `status` : nombre de chunks indexés, fichiers, dernière indexation
- [x] Tests : needle-in-a-codebase (chunk pertinent retrouvé ?)

**Validation manuelle** : `bluetang index ./src` puis poser une question sur la codebase → la réponse du modèle reflète le code indexé.

**Piège découvert** : FTS5 tokenizer `unicode61` ne découpe pas le camelCase — "envoyerEmail" est un seul token. Les requêtes doivent utiliser des mots entiers présents dans le code.

---

---

## Phase 3 — RAG sémantique + Hybrid

**Critère** : "Où est gérée l'authentification ?" → bonne réponse même sans le mot exact.

**Prérequis** : `ollama pull nomic-embed-text`

- [x] Intégration sqlite-vec : table vecteurs liée aux chunks (via chunks_vec_map)
- [x] Embedding des chunks via Ollama (`nomic-embed-text`, 768 dimensions)
- [x] Indexation incrémentale avec chokidar (re-embed uniquement les fichiers modifiés)
- [x] Recherche sémantique : embed question → cosinus top-K
- [x] Hybrid scoring : `0.4 × bm25 + 0.6 × cosinus`
- [x] Seuil de pertinence : si score max < 0.35, pas d'injection (passthrough pur)
- [x] Tests : questions en langage naturel sur la codebase

**Piège découvert** : sqlite-vec v0.1.7-alpha n'accepte pas de rowid explicite dans les INSERT (`INSERT INTO chunks_vec(rowid, embedding)` → erreur). Solution : auto-rowid + table de liaison `chunks_vec_map(vec_rowid, chunk_id)`.

---

## Phase 4 — Mémoire de conversation

**Critère** : après 30 échanges, le modèle retrouve une décision prise au tour 5.

- [x] Gestion des sessions : tables `sessions` + `messages_session` dans SQLite
- [x] Identification session : SHA-256 des 3 premiers messages (best-effort)
- [x] Sauvegarde des échanges après chaque réponse (tee() du stream SSE + capture async)
- [x] Résumé progressif : au-delà de 10 messages, résumer les anciens (même modèle, tous les 5 nouveaux)
- [x] Extraction de faits clés (heuristiques regex : prénom, outils, projet, préférences)
- [x] Injection mémoire dans le prompt (résumé + faits en 1er message système, avant RAG)
- [x] Tests : rétention sur conversation simulée (30 messages, décision du tour 5 dans le résumé)

---

## Phase 5 — Finition et publication

**Critère** : projet publié sur npm, documenté, benchmarké.

- [ ] Remplacement chunking heuristique par tree-sitter AST (TypeScript, JS, Python, PHP)
- [ ] Endpoint `GET /stats` avec métriques temps réel
- [ ] Fichier de configuration `.bluetang.json`
- [ ] Benchmarks complets : recall RAG, latence TTFT, rétention mémoire, RAM
- [ ] README complet avec démo GIF
- [ ] Publication npm (`npm publish`)
- [ ] GitHub : tags, releases, topics

---

## Phase 5+ — Améliorations futures (non planifiées)

- Re-ranking cross-encoder léger
- Graphe de dépendances imports/exports
- Support multi-projets (plusieurs index)
- Plugin VSCode natif
- Dashboard web local pour visualiser l'index

---

## Idée — Client MCP générique

**Problème** : Ollama ne supporte pas MCP nativement → les modèles locaux ne peuvent pas accéder à des outils et sources de données externes (notes, fichiers, APIs...).

**Idée** : faire de BlueTang un **client MCP** qui interroge des serveurs MCP configurés, injecte le contexte pertinent dans le prompt, puis forward vers Ollama. Ollama ne sait jamais que MCP existe.

```
Client LLM → BlueTang → [MCP servers] → prompt enrichi → Ollama
```

**Configuration envisagée dans `.bluetang.json`** :
```json
{
  "mcp": [
    { "name": "anytype", "transport": "sse", "url": "http://localhost:31007" },
    { "name": "filesystem", "transport": "stdio", "command": "npx @modelcontextprotocol/server-filesystem /home/user/docs" }
  ]
}
```

**Ce que ça apporte** : n'importe quel serveur MCP (Anytype, Obsidian, filesystem, base de données...) devient accessible à un modèle local sans modifier Ollama ni le client LLM.

**À creuser** : stratégie d'injection (toujours ? selon pertinence ?), gestion des transports stdio vs SSE, MCP SDK TypeScript disponible.
