# MADSuite E2E

Dépôt officiel des tests end-to-end MADSuite.

## Source de vérité

```text
bleeband/SYSTEME_MAD
```

Documents liés :

```text
SYSTEME_MAD/09-CHECKLISTS/chk-033-validation-mobile-responsive-madsuite.md
SYSTEME_MAD/05-PLAY/play-038-qa-mobile-reelle-madsuite.md
SYSTEME_MAD/10-ROADMAP/madsuite-mobile-e2e-hardening-board.md
```

## Rôle

Ce dépôt valide les parcours critiques MADSuite : authentification, onboarding, clients, projets, temps, factures, estimés, portail, modules, isolation organisation et régressions responsive mobile.

## Stack

- Playwright
- Node.js
- dotenv

## Structure

```text
tests/
helpers/
storageState/
playwright.config.js
.env.example
```

## Commandes

```bash
npm install
npm test
npm run test:responsive
npm run report
```

## Environnement

Copier `.env.example` vers `.env` au besoin.

```bash
cp .env.example .env
```

Variables principales :

```text
TEST_BASE_URL=http://localhost:3000
TEST_API_URL=http://localhost:5000/api
TEST_ADMIN_EMAIL=test-admin@example.com
TEST_PASSWORD=change-me
E2E_AUTH_FILE=storageState/auth.json
```

Ne jamais commiter `.env` ou un fichier de session réelle.

## Tests responsive mobile

Le fichier principal est :

```text
tests/responsive-mobile.spec.js
```

Il vérifie les routes principales sur les largeurs :

- 375 px
- 390 px
- 430 px
- 768 px
- 1440 px

La règle anti-scroll horizontal minimale est :

```javascript
scrollWidth <= clientWidth + 2
```

## Règles

- Données de test seulement.
- Pas de fichiers de session réelle.
- Pas de valeurs privées.
- Tests stables et orientés parcours métier.
- Les tests ne remplacent pas la QA mobile réelle sur iPhone / Safari.

## Statut

Activation en cours. Priorité : connecter les tests responsive mobile aux parcours authentifiés et ajouter un rapport de validation après la prochaine passe mobile réelle.
