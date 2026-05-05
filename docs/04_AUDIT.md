# Audit BlueTang v0.3.0 — Rapport complet

**Date** : 4 mars 2026
**Version auditée** : v0.3.0 (commit `1b94320`)
**Axes couverts** : sécurité, installation, configuration, suppression, performance, documentation, qualité du code, tests, présentation publique

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Sécurité](#2-sécurité)
3. [Installation et onboarding](#3-installation-et-onboarding)
4. [Configuration](#4-configuration)
5. [Suppression et nettoyage](#5-suppression-et-nettoyage)
6. [Performance](#6-performance)
7. [Documentation](#7-documentation)
8. [Qualité du code](#8-qualité-du-code)
9. [Tests](#9-tests)
10. [Présentation publique](#10-présentation-publique)
11. [Test en situation réelle](#11-test-en-situation-réelle)
12. [Plan de correction](#12-plan-de-correction)

---

## 1. Résumé exécutif

BlueTang est un projet bien structuré, fonctionnel, avec une architecture claire et une couverture de tests correcte. Le code est propre et les phases 1 à 7 sont terminées.

**Cependant**, avant publication npm publique et promotion, plusieurs points bloquants doivent être résolus :

| Sévérité | Nombre |
|----------|--------|
| 🔴 Critique | 3 |
| 🟠 Majeur | 8 |
| 🟡 Mineur | 22 |
| 💡 Suggestion | 4 |

**Verdict** : publication npm possible après correction des 3 critiques et 5 premiers majeurs.

---

## 2. Sécurité

### SEC-01 🔴 Injection d'URL Ollama sans validation
- **Localisation** : `src/config.ts:36`, `src/index.ts:26`
- **Problème** : `ollamaUrl` lue depuis `.bluetang.json` sans validation du schéma ou du domaine. Un fichier de config malveillant pourrait rediriger les prompts vers un serveur tiers.
- **Correction** : Valider avec `new URL(v)` et restreindre à `http://` ou `https://`.

### SEC-02 🟠 Arguments MCP non validés contre `inputSchema`
- **Localisation** : `src/serveur/completions.ts:128-147`
- **Problème** : Les arguments passés à `callTool()` viennent directement de la réponse Ollama, sans validation contre le schéma JSON déclaré par le serveur MCP. Un modèle mal aligné pourrait passer `path: "../../etc/passwd"` à un outil filesystem.
- **Correction** : Valider les arguments contre `tool.inputSchema` avec Zod ou Ajv.

### SEC-03 🟠 Permissions du dossier `.bluetang/` trop ouvertes
- **Localisation** : `src/bdd/connexion.ts:9-17`
- **Problème** : SQLite créée avec les permissions OS par défaut (644 sur Unix — lisible par tous les utilisateurs du système). La base contient les sessions et résumés de conversation.
- **Correction** : Appliquer `chmod 700` au dossier `.bluetang/` après création.

### SEC-04 🟡 Absence de rate-limiting
- **Localisation** : `src/serveur/app.ts`, `src/serveur/completions.ts`
- **Problème** : Aucun rate-limiting. Un client local peut saturer Ollama ou la base SQLite.
- **Correction** : Ajouter un middleware de rate-limiting (ex. `hono-rate-limit`).

### SEC-05 🟡 Aucune sanitisation des chemins d'indexation
- **Localisation** : `src/indexation/scanner.ts:39-50`, `src/cli/init.ts:99`
- **Problème** : Un chemin passé à `bluetang index /etc/` indexerait des fichiers système. `.gitignore` est respecté mais ne filtre pas les chemins hors projet.
- **Correction** : Valider que le chemin résolu est sous le répertoire de travail courant, ou ajouter un avertissement.

### SEC-06 🟡 `.bluetang.json` absent du `.gitignore` par défaut
- **Problème** : Si `.bluetang.json` contient une URL avec credentials, il peut être committé par erreur.
- **Correction** : La commande `init` devrait vérifier/ajouter `.bluetang.json` au `.gitignore` local.

---

## 3. Installation et onboarding

### INS-01 🔴 Version incohérente dans le code
- **Localisation** : `src/serveur/modeles.ts:5` (`VERSION = '0.2.0'`), `src/mcp/client.ts:29` (`version: '0.2.0'`), `src/index.ts:20` (`.version('0.2.0')`)
- **Problème** : `package.json` indique `0.3.0` mais le code affiche `0.2.0`.
- **Correction** : Lire la version depuis `package.json` à la compilation via `tsup` ou import dynamique.

### INS-02 🟠 Metadata npm incomplète
- **Localisation** : `package.json`
- **Problème** : Pas de `keywords`, `author`, `repository`, `homepage`, `engines`, `license`.
- **Correction** :
  ```json
  {
    "author": "OnyxynO <etievant.sebastien@protonmail.com>",
    "repository": { "type": "git", "url": "https://github.com/OnyxynO/BlueTang" },
    "homepage": "https://github.com/OnyxynO/BlueTang#readme",
    "keywords": ["llm", "ollama", "rag", "mcp", "proxy", "local-ai", "continue"],
    "engines": { "node": ">=22.0.0" },
    "license": "MIT"
  }
  ```

### INS-03 🟡 Scripts npm incomplets
- **Problème** : Pas de `"prepublishOnly": "npm test && npm run build"` — risque de publier une version non testée.
- **Correction** : Ajouter `prepublishOnly` et `"pretest": "npm run typecheck"`.

### INS-04 🟡 Shebang à vérifier après build
- **Localisation** : `src/index.ts:1` (`#!/usr/bin/env node`)
- **Problème** : `tsup` doit préserver le shebang. À vérifier dans `dist/index.js`.
- **Correction** : Tester `npm run build && head -1 dist/index.js` → doit afficher `#!/usr/bin/env node`.

---

## 4. Configuration

### CFG-01 🔴 Validation absente sur `.bluetang.json`
- **Localisation** : `src/config.ts:30-44`
- **Problème** : Les types ne sont pas vérifiés. `port: "abc"` → `Number("abc")` = `NaN` → crash au démarrage du serveur.
  ```typescript
  // Actuel — aucune validation de type
  const resultat = Object.fromEntries(
    Object.entries(json).filter(([k]) => clesValides.has(k))
  ) as Partial<Config>
  ```
- **Correction** : Utiliser Zod pour valider le schéma :
  ```typescript
  const ConfigSchema = z.object({
    port: z.number().int().min(1).max(65535).optional(),
    ollamaUrl: z.string().url().optional(),
    modele: z.string().min(1).optional(),
    numCtx: z.number().int().min(512).max(131072).optional(),
    cheminBdd: z.string().optional(),
    mcp: z.array(McpServeurConfigSchema).optional(),
  })
  ```

### CFG-02 🟠 Modèle Ollama non vérifié au démarrage
- **Localisation** : `src/index.ts` (commande `serve`)
- **Problème** : Si le modèle configuré n'existe pas dans Ollama, chaque requête retourne 404 sans message clair.
- **Correction** : Au startup, appeler `/v1/models` et vérifier que le modèle est présent, sinon afficher un warning explicite.

### CFG-03 🟠 Serveurs MCP en erreur non signalés clairement
- **Localisation** : `src/mcp/gestionnaire.ts:7-24`
- **Problème** : Si un serveur MCP échoue à démarrer, le gestionnaire affiche un `console.warn` discret. L'utilisateur pense que MCP est actif.
- **Correction** : Afficher un message d'erreur visible au startup et continuer sans ce serveur (dégradé gracieux).

### CFG-04 🟡 Validation trop permissive dans `init`
- **Localisation** : `src/cli/init.ts:27-39`
- **Problème** : `"httppp://invalid"` passe la validation URL car seul le préfixe `http` est testé.
- **Correction** : Utiliser `new URL(v)` et vérifier le protocole.

### CFG-05 🟡 JSON strict uniquement (pas de commentaires)
- **Problème** : Les utilisateurs s'attendent à pouvoir commenter `.bluetang.json`. `JSON.parse()` rejette les commentaires.
- **Correction** : Documenter clairement que seul JSON strict est accepté, ou ajouter support de `json5`.

---

## 5. Suppression et nettoyage

### SUP-01 🔴 Aucune commande de nettoyage
- **Problème** : Impossible de réinitialiser l'index ou les sessions sans intervenir directement sur la base SQLite.
- **Correction** : Ajouter la commande :
  ```bash
  bluetang clean [--index] [--sessions] [--all]
  ```
  - `--index` : supprime `fichiers`, `chunks`, `chunks_fts`, `chunks_vec`, `chunks_vec_map`
  - `--sessions` : supprime `sessions`, `messages_session`
  - `--all` : équivalent à `--index --sessions`
  - Confirmation interactive avant suppression (`confirm("Supprimer X fichiers et Y chunks ?")`)

### SUP-01b 🟠 `bluetang clean` plante sans TTY (SSH non-interactif)
- **Découvert** : test Phase B (SSH vers Mac mini)
- **Problème** : `@inquirer/prompts` lance une `ExitPromptError` quand il n'y a pas de terminal interactif (piped input, SSH, scripts CI).
- **Correction** : Ajouter une option `--yes/-y` pour bypasser la confirmation interactive.

### SUP-02 🟠 Pas de sauvegarde avant suppression
- **Problème** : Pas de mécanisme pour backup la DB avant un `clean --all`.
- **Correction** : Avant suppression, copier `index.db` → `index.db.bak` avec timestamp.

### SUP-03 🟡 Pas d'export/import de l'index
- **Problème** : Un index volumineux ne peut pas être transféré vers un autre machine/projet.
- **Correction** : Ajouter `bluetang export <fichier>` et `bluetang import <fichier>` (simple copie SQLite ou dump JSON).

---

## 6. Performance

### PERF-01 🟠 Index SQLite manquant sur `chunks.fichier_id`
- **Localisation** : `src/bdd/schema.ts:15-23`
- **Problème** : `DELETE FROM chunks WHERE fichier_id = ?` lors du reindexing est O(n) sans index.
  ```sql
  -- Manquant dans schema.ts
  CREATE INDEX IF NOT EXISTS idx_chunks_fichier_id ON chunks(fichier_id);
  ```
- **Impact** : Reindexation lente avec 1000+ fichiers.

### PERF-02 🟠 Embeddings séquentiels, pas de batching
- **Localisation** : `src/indexation/pipeline.ts:96`
- **Problème** : 87 chunks = 87 appels Ollama séquentiels. Ollama supporte le batching.
  ```typescript
  // Actuel — séquentiel
  for (let i = 0; i < chunks.length; i++) {
    const vecteur = await obtenirEmbedding(chunks[i].contenu, ollamaUrl)
  }
  ```
- **Impact** : Indexation 5-10x plus lente que nécessaire.

### PERF-03 🟠 Fichiers volumineux chargés entièrement en RAM
- **Localisation** : `src/indexation/pipeline.ts:65`
- **Problème** : Un fichier `.ts` de 10MB est chargé via `readFile()` en une seule fois.
- **Correction** : Ignorer les fichiers > 5MB (configurable) avec un avertissement.

### PERF-04 🟡 Pas de timeout sur les appels `fetch()` Ollama
- **Localisation** : `src/rag/embedder.ts:4-7`, `src/serveur/completions.ts:89`
- **Problème** : Si Ollama pend, `fetch()` attend indéfiniment.
- **Correction** : Ajouter `signal: AbortSignal.timeout(30_000)` sur tous les appels.

### PERF-05 🟡 Pas de cache d'embedding
- **Localisation** : `src/indexation/pipeline.ts:95`
- **Problème** : Si un fichier est ré-indexé sans changement de contenu, les embeddings sont recalculés.
- **Correction** : Hash du contenu → si inchangé, réutiliser le vecteur existant.

### PERF-06 🟡 Pas de limite de taille de session
- **Localisation** : `src/memoire/session.ts`
- **Problème** : Une conversation très longue peut entraîner un memory leak progressif.
- **Correction** : Limiter à `MAX_MESSAGES = 500` et archiver les messages plus anciens.

### PERF-07 🟡 Vecteurs sérialisés en JSON string
- **Localisation** : `src/indexation/pipeline.ts:99`, `src/rag/recherche.ts:93`
- **Problème** : 768 floats sérialisés/parsés en JSON string à chaque requête — overhead inutile.
- **Correction** : Conserver le JSON string (contrainte sqlite-vec), mais éviter les re-sérialisations inutiles.

---

## 7. Documentation

### DOC-01 🔴 Version incohérente (voir INS-01)
- `CLAUDE.md` et `index.ts` mentionnent `0.2.0`, `package.json` dit `0.3.0`.

### DOC-02 🟡 Badges manquants dans le README
- Pas de badges version npm, licence, Node.js version.
- **Correction** :
  ```markdown
  ![npm version](https://img.shields.io/npm/v/bluetang)
  ![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
  ![License](https://img.shields.io/badge/license-MIT-blue)
  ```

### DOC-03 🟡 Pas de section Troubleshooting dans le README
- **Correction** : Ajouter les erreurs les plus courantes (port occupé, modèle manquant, Ollama unreachable, db corrompue).

### DOC-04 🟡 STOPWORDS dupliquées dans le code
- **Localisation** : `src/rag/recherche.ts:14-21` et `src/mcp/pertinence.ts:4-10`
- **Correction** : Extraire dans `src/utils/stopwords.ts`.

### DOC-05 🟡 Pas de CHANGELOG.md
- **Correction** : Créer `CHANGELOG.md` rétroactivement pour v0.1.0, v0.2.0, v0.3.0.

### DOC-06 🟡 Pas de CONTRIBUTING.md
- **Correction** : Créer avec fork, install, test, PR workflow.

---

## 8. Qualité du code

### CODE-01 🟠 Erreurs silencieuses en cascade
- **Localisation** : `src/rag/recherche.ts:53/114`, `src/rag/assembleur.ts:38`, `src/mcp/client.ts:51/67`
- **Problème** :
  ```typescript
  catch {
    return []  // L'erreur est ignorée silencieusement
  }
  ```
- **Correction** : Logger en mode verbose (`if (config.verbose) console.error(...)`) et ne jamais ignorer sans trace.

### CODE-02 🟠 Erreurs Ollama non transmises au client
- **Localisation** : `src/serveur/completions.ts:252`
- **Problème** : `return c.json({ error: 'Ollama inaccessible' }, 503)` — le message réel d'Ollama est perdu.
- **Correction** : Transmettre `await reponse.text()` dans le message d'erreur.

### CODE-03 🟠 Fichiers vides acceptés à l'indexation
- **Localisation** : `src/indexation/pipeline.ts:65`
- **Correction** : Ignorer les fichiers `< 10` bytes.

### CODE-04 🟡 Pas de timeout sur les connexions MCP
- **Localisation** : `src/mcp/client.ts:32-39`
- **Problème** : Un serveur MCP qui ne répond pas bloque indéfiniment.
- **Correction** : Wrapper `connecter()` avec `Promise.race([..., timeout(5000)])`.

### CODE-05 🟡 Cast `as any` dans le code
- **Localisation** : `src/serveur/completions.ts:259`
- **Correction** : Remplacer par `reponseOllama.status as number`.

### CODE-06 🟡 Types Ollama dispersés
- **Localisation** : `src/serveur/completions.ts:13-24`
- **Correction** : Centraliser les types Ollama dans `src/types/ollama.ts`.

---

## 9. Tests

### TEST-01 🟡 Pas de tests d'intégration E2E
- **Problème** : Aucun test simulant une requête complète client → BlueTang → Ollama → client.
- **Correction** : Ajouter `tests/integration.test.ts` avec Ollama fully mocked.

### TEST-02 🟡 Pas de tests pour les commandes CLI
- **Problème** : `init`, `clean` (à créer), `watch` ne sont pas testées.
- **Correction** : Ajouter `tests/cli.test.ts`.

### TEST-03 🟡 Pas de tests de charge
- **Problème** : Performance avec 10 000 chunks ou 100 sessions inconnue.
- **Correction** : Ajouter `scripts/load-test.ts`.

### TEST-04 🟡 Pas de tests de concurrence
- **Problème** : Deux indexations simultanées du même fichier — comportement inconnu.
- **Correction** : `it('concurrent indexing', async () => { await Promise.all([...]) })`.

### TEST-05 🟡 Pas de tests pour les erreurs réseau
- **Problème** : Timeouts, réponses partielles, erreurs Ollama non couvertes.
- **Correction** : Ajouter des cas de mock avec erreurs réseau dans `tests/proxy.test.ts`.

---

## 10. Présentation publique

### PUB-01 🟠 Metadata npm incomplète (voir INS-02)

### PUB-02 🟡 Badges manquants (voir DOC-02)

### PUB-03 🟡 Pas de démo visuelle
- **Problème** : Un outil CLI sans interface visuelle bénéficie d'un GIF ou screencast dans le README.
- **Correction** : Enregistrer un `asciinema` ou GIF de `bluetang init` + `bluetang serve`.

### PUB-04 🟡 Pas d'exemple de cas d'usage complet dans le README
- **Correction** : Ajouter un exemple requête → réponse enrichie avec contexte RAG visible.

### PUB-05 🟡 Pas de Release Notes sur GitHub
- **Correction** : Créer des tags GitHub annotés avec description pour v0.1.0, v0.2.0, v0.3.0.

---

## 11. Test en situation réelle

> **Objectif** : Valider BlueTang dans une configuration réseau réelle :
> - **Mac mini** : serveur Ollama + BlueTang (LAN)
> - **Poste local** : VS Code + extension Continue → requêtes via le réseau

### 11.1 Architecture cible

```
Poste local (VS Code + Continue)
         |
         |  HTTP sur LAN (port 11435)
         ▼
Mac mini (IP locale ex. 192.168.1.X)
+-- Ollama         (port 11434 — localhost uniquement)
+-- BlueTang       (port 11435 — 0.0.0.0 ou LAN)
    +-- RAG (index codebase locale du Mac mini)
    +-- Mémoire de session
    +-- Client MCP (optionnel)
```

### 11.2 Prérequis Mac mini (serveur)

```bash
# 1. Ollama lancé et accessible localement
brew services start ollama
curl http://localhost:11434/health  # → {"status":"ok"}

# 2. Modèle installé
ollama pull qwen3:1.7b
ollama pull nomic-embed-text  # si embeddings sémantiques

# 3. BlueTang installé
npm install -g bluetang  # ou : npm run build && npm link

# 4. Config BlueTang
bluetang init
# → Port : 11435
# → URL Ollama : http://localhost:11434  (local au Mac mini)
# → Modèle : qwen3:1.7b
# → Indexer le dossier projet

# 5. Lancer BlueTang en écoute sur toutes les interfaces
bluetang serve  # écoute sur 0.0.0.0:11435 ?  ← À VÉRIFIER (voir point ci-dessous)
```

> ✅ **Vérifié** : `honoServe({ fetch, port })` sans `hostname` → Node.js écoute sur `0.0.0.0` par défaut. Accessible sur le LAN sans modification.
> **Localisation** : `src/serveur/app.ts:38`

### 11.3 Configuration Continue.dev (poste local)

Fichier `~/.continue/config.json` sur le poste local :

```json
{
  "models": [
    {
      "title": "Qwen3 1.7B (BlueTang — Mac mini)",
      "provider": "openai",
      "model": "qwen3:1.7b",
      "apiBase": "http://192.168.1.X:11435/v1",
      "apiKey": "not-needed"
    }
  ]
}
```

Remplacer `192.168.1.X` par l'IP locale du Mac mini (`ip addr` ou `ifconfig | grep inet`).

### 11.4 Checklist de validation

#### Réseau et connectivité

- [ ] BlueTang accessible depuis le poste local : `curl http://192.168.1.X:11435/health`
- [ ] Port 11435 ouvert sur le Mac mini : `sudo lsof -i :11435` côté serveur
- [ ] Pare-feu macOS (Mac mini) : vérifier que le port est autorisé (`Préférences Système > Sécurité > Pare-feu`)
- [ ] BlueTang écoute sur `0.0.0.0` (pas `127.0.0.1`) : voir `src/serveur/app.ts`

#### Fonctionnalités de base

- [ ] `/health` répond depuis le poste local
- [ ] `/v1/models` liste les modèles Ollama
- [ ] Chat simple sans RAG fonctionne (prompt vide, sans contexte)
- [ ] Chat avec RAG fonctionne (question sur la codebase indexée)
- [ ] Streaming fonctionne dans VS Code Continue (réponse progressive)

#### Continue.dev

- [ ] Extension Continue détecte le modèle BlueTang
- [ ] `@codebase` ou sélection de code + question fonctionne
- [ ] Pas d'erreur CORS (BlueTang doit ajouter les headers si nécessaire)
- [ ] La réponse est cohérente avec le contexte de la codebase

#### Performance réseau

- [ ] Latence première réponse (Time To First Token) < 10s sur LAN
- [ ] Streaming fluide (pas de freeze mid-réponse)
- [ ] Réponse complète sans timeout de Continue.dev

#### Stabilité

- [ ] 10 requêtes consécutives sans erreur
- [ ] Redémarrage du Mac mini → BlueTang relancé automatiquement (launchd ou script de démarrage ?)
- [ ] Sessions persistantes après redémarrage de BlueTang

### 11.5 Points bloquants anticipés

| # | Problème potentiel | Diagnostic | Solution |
|---|-------------------|------------|----------|
| 1 | BlueTang écoute sur `localhost` uniquement | `curl` depuis le poste local → connexion refusée | Ajouter option `--host 0.0.0.0` |
| 2 | Pare-feu macOS bloque le port 11435 | `curl` timeout (pas de refus immédiat) | Autoriser le port dans les préférences système |
| 3 | CORS rejeté par Continue.dev | Erreur dans la console VS Code | Ajouter middleware CORS dans Hono |
| 4 | Timeout Continue.dev < délai de génération | Réponse coupée | Augmenter `requestOptions.timeout` dans Continue config |
| 5 | IP Mac mini change (DHCP) | Connexion perdue après reboot du routeur | Assigner une IP fixe au Mac mini (DHCP statique) |

### 11.6 CORS — point critique

Continue.dev fait des requêtes cross-origin. BlueTang doit accepter les requêtes depuis l'IP du poste local.

**Vérification** : `src/serveur/app.ts` — Hono a-t-il un middleware CORS ?

Si absent :
```typescript
import { cors } from 'hono/cors'
app.use('*', cors({
  origin: '*',  // ou restreindre à l'IP du poste local
  allowMethods: ['GET', 'POST'],
}))
```

---

## 12. Plan de correction

### Phase A — Bloquant (avant npm publish)

| Ticket | Sévérité | Problème | Effort estimé |
|--------|----------|----------|---------------|
| A1 | 🔴 | INS-01 — Version centralisée depuis `package.json` | 30 min |
| A2 | 🔴 | SUP-01 — Commande `bluetang clean` | 2h |
| A3 | 🔴 | SEC-01 / CFG-01 — Valider `ollamaUrl` + schéma Zod pour `.bluetang.json` | 3h |
| A4 | 🟠 | INS-02 — Compléter metadata `package.json` | 15 min |
| A5 | 🟠 | INS-03 — Ajouter `prepublishOnly` + `pretest` | 15 min |
| A6 | 🟠 | PERF-01 — Index SQLite sur `chunks.fichier_id` | 30 min |
| A7 | 🟠 | CODE-03 — Ignorer les fichiers vides | 15 min |

### Phase B — Test en situation réelle (Mac mini + Continue.dev)

| Ticket | Problème | Effort estimé |
|--------|----------|---------------|
| B1 | ✅ Écoute `0.0.0.0` — OK par défaut (Node.js) | — |
| B2 | Vérifier/ajouter middleware CORS | 30 min |
| B3 | Tester checklist 11.4 complète | 2h |
| B4 | Documenter la config LAN dans le README | 1h |

### Phase C — Qualité et robustesse

| Ticket | Sévérité | Problème | Effort estimé |
|--------|----------|----------|---------------|
| C1 | 🟠 | CODE-01 — Logger les erreurs silencieuses | 1h |
| C2 | 🟠 | CODE-02 — Transmettre les erreurs Ollama au client | 30 min |
| C3 | 🟠 | CFG-02 — Vérifier le modèle Ollama au startup | 1h |
| C4 | 🟡 | PERF-04 — Timeout `AbortSignal.timeout()` sur fetch | 30 min |
| C5 | 🟡 | PERF-02 — Batching embeddings | 3h |
| C6 | 🟡 | SEC-02 — Valider args MCP contre `inputSchema` | 2h |
| C7 | 🟡 | CODE-04 — Timeout sur connexion MCP | 1h |
| C8 | 🟡 | DOC-04 — Extraire `STOPWORDS` en module partagé | 20 min |

### Phase D — Présentation publique

| Ticket | Problème | Effort estimé |
|--------|----------|---------------|
| D1 | DOC-02 — Badges README | 20 min |
| D2 | DOC-03 — Section Troubleshooting README | 1h |
| D3 | DOC-05 — CHANGELOG.md rétroactif | 1h |
| D4 | DOC-06 — CONTRIBUTING.md | 1h |
| D5 | PUB-03 — Démo GIF/asciinema | 2h |
| D6 | PUB-05 — Tags GitHub annotés | 30 min |

---

## Suivi

| Phase | État | Prérequis |
|-------|------|-----------|
| A — Bloquant | ⬜ À faire | — |
| B — Test LAN | ⬜ À faire | Phase A terminée |
| C — Robustesse | ⬜ À faire | Phase A terminée |
| D — Publication | ⬜ À faire | Phases A + B + C terminées |
