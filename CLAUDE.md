# CLAUDE.md — MADSuite E2E

Tests end-to-end (Playwright) + contrats (Jest) de MADSuite.

## ⚡ Règles strictes — Économie de tokens & Workflow mobile

Ces règles priment sur tout comportement par défaut de Claude Code sur ce repo.

### 1. Économie de tokens
- Réponses concises. Pas de blabla, pas de formules de politesse.
- Ne JAMAIS lancer `npx playwright test` sans cible (= toute la suite) ni `test:contracts` complet sauf demande explicite.
- Cibler uniquement le(s) spec(s) concerné(s) par le changement:
  - `npx playwright test tests/<fichier>.spec.js --reporter=dot`
  - Ajouter `--workers=1` uniquement si le test existant l'exige.
- Ne pas lancer les `guard:*` sauf demande explicite.

### 2. Pas de polling
- Ne JAMAIS boucler en attente d'un résultat CI/CD après un `git push`.
- S'arrêter dès que le push est effectué. Ne pas surveiller le pipeline.

### 3. Gestion des erreurs
- Si un test échoue: lire uniquement les 30 dernières lignes du rapport/stack trace (pas le rapport HTML complet).
- Ne jamais lire un log complet, même en cas d'échec répété.

### 4. Format mobile
- Résumés courts, étapes numérotées ou puces.
- Pas de longs paragraphes ni de gros blocs de code non essentiels.
