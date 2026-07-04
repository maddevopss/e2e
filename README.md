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
- GitHub Actions

## Structure

```text
.github/workflows/
tests/
helpers/
storageState/
playwright.config.js
.env.example
```

## Commandes

```bash
npm install
npm run test:auth
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

## Session de test authentifiée

Le fichier suivant prépare une session navigateur de test :

```text
tests/auth-ui.setup.js
```

Commande :

```bash
npm run test:auth
```

Cette commande crée le fichier défini par `E2E_AUTH_FILE`, par défaut :

```text
storageState/auth.json
```

Ce fichier est local seulement et doit rester ignoré par Git.

## Auth helper legacy

`helpers/auth.js` est conservé pour compatibilité, mais il ne doit pas logger de courriel, de réponse API ou de jeton.

Les nouveaux tests doivent privilégier :

```text
helpers/uiAuth.js
tests/auth-ui.setup.js
```

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

Après génération du fichier `storageState/auth.json`, les tests responsive peuvent accéder aux pages protégées si l’application accepte la session sauvegardée.

## CI responsive smoke

Le workflow suivant exécute les tests responsive :

```text
.github/workflows/responsive-smoke.yml
```

Déclencheurs :

- pull request vers `main`;
- lancement manuel avec `workflow_dispatch`.

La variable `TEST_BASE_URL` peut venir :

1. de l’input manuel `base_url`;
2. du secret GitHub `TEST_BASE_URL`;
3. du fallback `http://localhost:3000`.

Le rapport Playwright HTML est publié comme artefact pendant 7 jours.

## Règles

- Données de test seulement.
- Pas de fichiers de session réelle.
- Pas de valeurs privées.
- Tests stables et orientés parcours métier.
- Les tests ne remplacent pas la QA mobile réelle sur iPhone / Safari.

## Statut

Activation en cours. Le setup d’authentification silencieux et le workflow responsive smoke sont présents; prochaine étape : exécuter localement `npm run test:auth`, puis `npm run test:responsive`, avec le frontend et le backend démarrés.
