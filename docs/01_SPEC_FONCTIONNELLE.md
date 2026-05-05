# BlueTang — Spécification fonctionnelle

> Référence complète : `../../_specs/BlueTang/SPECS.md` (v2.0, février 2026)
> Ce fichier documente ce que le projet fait concrètement et les cas d'usage ciblés.

---

## Ce qu'est BlueTang

Un **proxy HTTP transparent** entre un client LLM et Ollama. Le client ne change rien : il pointe sur `:11435` au lieu de `:11434`. BlueTang intercepte les requêtes, enrichit le contexte, et transmet à Ollama.

```
Client (Continue.dev / Open WebUI / curl)
         |
         |  POST /v1/chat/completions
         ▼
  BlueTang :11435  ←-- enrichit le contexte
         |
         |  POST /v1/chat/completions (messages enrichis)
         ▼
    Ollama :11434
         |
         ▼ (stream SSE)
  BlueTang :11435  ←-- futur : capture pour mémoire
         |
         ▼
       Client
```

---

## Ce que le projet résout

| Problème | Solution |
|----------|---------|
| "Le modèle ne connaît pas mon code" | RAG : indexe la codebase, injecte les fichiers pertinents automatiquement |
| "Le modèle oublie après 15 échanges" | Mémoire : résumé progressif de la conversation |

**Le proxy rend un petit modèle plus utile, pas plus intelligent.**

---

## Cas d'usage supportés (Phase 2+)

| Question utilisateur | Ce que BlueTang fait |
|---------------------|---------------------|
| "Où est définie la fonction handleAuth ?" | RAG retrouve le bon fichier |
| "Explique ce que fait ce service" | Le chunk du service est injecté |
| "On avait décidé quoi pour l'auth ?" | Mémoire de conversation retrouve la décision |
| "Ajoute une méthode similaire à getUserById" | RAG injecte getUserById comme référence |

## Ce que le projet ne fait PAS

| Limitation | Raison |
|-----------|--------|
| Raisonnement multi-fichiers complexe | Le modèle voit des fragments, pas l'architecture globale |
| Refactoring cohérent sur 15 fichiers | Nécessite de tout voir simultanément |
| "Est-ce que ce changement casse autre chose ?" | Pas de graphe de dépendances en temps réel |
| Remplacer un modèle avec 128k de contexte natif | RAG ≠ compréhension globale |

---

## CLI

```
bluetang <commande> [options]

Commandes :
  serve           Lancer le serveur proxy

Options :
  -p, --port <port>         Port du proxy (défaut : 11435)
  --ollama-url <url>        URL Ollama (défaut : http://localhost:11434)
  -m, --model <nom>         Modèle Ollama (défaut : qwen3:8b)
  --num-ctx <n>             Contexte en tokens (défaut : 16384)
  -v, --verbose             Logs détaillés

Exemples :
  bluetang serve
  bluetang serve -v
  bluetang serve -p 11436 --ollama-url http://192.168.1.10:11434
```

Commandes prévues en Phase 2+ :
```
  index           Indexer un répertoire (one-shot)
  status          État : chunks indexés, sessions actives
  chat            Mode conversation interactif (terminal)
```

---

## Endpoints HTTP (Phase 1)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| POST | `/v1/chat/completions` | Proxy vers Ollama — stream SSE ou JSON |
| GET | `/v1/models` | Liste des modèles Ollama disponibles |
| POST | `/v1/embeddings` | Passthrough vers Ollama |
| GET | `/health` | `{ statut, ollama, proxy }` |

Endpoint prévu en Phase 2+ :
| GET | `/stats` | Chunks indexés, latence RAG, sessions actives |

---

## Compatibilité

Tout client compatible API OpenAI fonctionne sans modification :

| Client | Configuration |
|--------|--------------|
| Continue.dev | `apiBase: http://localhost:11435/v1` |
| Open WebUI | URL de base : `http://localhost:11435` |
| curl / SDK | Même format qu'OpenAI |

---

## Machine de référence

Mac Mini M4 — 16 Go RAM (voir `../../_specs/BlueTang/SPECS.md` §3 pour le budget mémoire détaillé).
