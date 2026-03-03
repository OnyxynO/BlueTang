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

## Phase 2 — Indexation + RAG BM25

**Critère** : poser "Que fait la fonction X ?" et obtenir une réponse basée sur le bon fichier.

**Pourquoi BM25 d'abord** : pas besoin d'Ollama pour les embeddings, itération rapide, bon pour les noms exacts.

- [ ] Schéma SQLite : tables `chunks`, `chunks_fts` (FTS5)
- [ ] Chunking heuristique (regex par langage : TS/JS, Python, PHP, fallback universel)
- [ ] Pipeline d'indexation : scan fichiers → filtre `.gitignore` → détection changements (hash) → chunks → FTS5
- [ ] CLI `index -c <chemin>` avec progression
- [ ] Recherche BM25 : FTS5 → top-K → sélection par budget tokens
- [ ] Assembleur de prompt : injecter les chunks en message `system` juste avant la question
- [ ] Interception `POST /v1/chat/completions` : enrichir les messages avant forward
- [ ] CLI `status` : nombre de chunks indexés, fichiers, dernière indexation
- [ ] Tests : needle-in-a-codebase (chunk pertinent retrouvé ?)

---

## Phase 3 — RAG sémantique + Hybrid

**Critère** : "Où est gérée l'authentification ?" → bonne réponse même sans le mot exact.

**Prérequis** : `ollama pull nomic-embed-text`

- [ ] Intégration sqlite-vec : table vecteurs liée aux chunks
- [ ] Embedding des chunks via Ollama (`nomic-embed-text`, 768 dimensions)
- [ ] Indexation incrémentale avec chokidar (re-embed uniquement les fichiers modifiés)
- [ ] Recherche sémantique : embed question → cosinus top-K
- [ ] Hybrid scoring : `0.4 × bm25 + 0.6 × cosinus`
- [ ] Seuil de pertinence : si score max < 0.35, pas d'injection (passthrough pur)
- [ ] Tests : questions en langage naturel sur la codebase

---

## Phase 4 — Mémoire de conversation

**Critère** : après 30 échanges, le modèle retrouve une décision prise au tour 5.

- [ ] Gestion des sessions : table `sessions` + `messages` dans SQLite
- [ ] Identification session : SHA-256 des 3 premiers messages (best-effort)
- [ ] Sauvegarde des échanges après chaque réponse (capture du stream)
- [ ] Résumé progressif : au-delà de 10 messages, résumer les anciens (même modèle)
- [ ] Extraction de faits clés (heuristiques regex)
- [ ] Injection mémoire dans le prompt (faits + résumé)
- [ ] Tests : rétention sur conversation simulée de 50 tours

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
