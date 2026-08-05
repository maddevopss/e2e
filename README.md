# MADSuite E2E

**Version du package : 0.1.0.**

Dépôt officiel des tests de bout en bout de MADSuite.

## Source de vérité

```text
maddevopss/SYSTEME_MAD
```

Documents liés, à lire à la racine du dépôt `maddevopss/SYSTEME_MAD` :

```text
09-CHECKLISTS/chk-033-validation-mobile-responsive-madsuite.md
05-PLAY/play-038-qa-mobile-reelle-madsuite.md
10-ROADMAP/madsuite-mobile-e2e-hardening-board.md
```

## Rôle

Ce dépôt valide les parcours critiques MADSuite : authentification, onboarding, clients, projets, temps, factures, estimés, portail, modules, isolation organisation et régressions responsive mobile.

## État de fondation V1

La certification E2E V1 est fusionnée. Le dépôt contient maintenant un contrat de certification, une matrice de parcours et un registre de preuves permettant de constater la couverture globale sans confondre une validation automatisée avec une garantie absolue d’absence de défaut.

La fermeture V1 couvre notamment :

- les parcours publics et authentifiés;
- le cycle client, projet, temps et facturation;
- l’isolation entre organisations, y compris les refus d’accès croisé;
- les principaux formats desktop et mobile;
- la traçabilité des résultats et des limites connues.

Les nouveaux parcours métier doivent être ajoutés à la matrice E2E lorsqu’ils deviennent critiques ou lorsqu’ils relient plusieurs grands modules.

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

## MADPROOF checks

Avant de pousser une correction E2E, exécuter :

```bash
npm run guard:gitignore
npm run guard:hygiene
```

Validation publique complète :

```bash
npm run check:e2e
```

Les guards bloquent notamment :

- règles `.gitignore` critiques manquantes;
- fichier d’environnement réel;
- `storageState/*.json`;
- `playwright-report/`;
- `test-results/`.

`storageState/auth.json` est un fichier local de session navigateur. Il ne doit jamais être commité.

## Environnement

Copier `.env.example` vers `.env` au besoin.

```bash
cp .env.example .env
```

Variables principales locales :

```text
TEST_BASE_URL=http://127.0.0.1:3000
TEST_API_URL=http://localhost:5000/api
TEST_ADMIN_EMAIL=test-admin@example.com
TEST_PASSWORD=change-me
E2E_AUTH_FILE=storageState/auth.json
```

Alias CI supportés pour l’authentification :

```text
E2E_ADMIN_EMAIL=test-admin@example.com
E2E_PASSWORD=change-me
E2E_SIGNUP_PASSWORD=
```

`helpers/uiAuth.js` accepte `TEST_ADMIN_EMAIL` / `TEST_PASSWORD`, puis `E2E_ADMIN_EMAIL` / `E2E_PASSWORD`, puis les alias utilisateur historiques `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`.

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

## Auth helper historique

`helpers/auth.js` est conservé pour compatibilité, mais il ne doit pas journaliser de courriel, de réponse API ou de jeton.

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

La règle anti-défilement horizontal minimale est :

```javascript
scrollWidth <= clientWidth + 2
```

Les routes sont séparées en trois intentions :

- routes publiques : elles doivent rendre du contenu visible sans débordement horizontal;
- routes protégées sans session : elles doivent garder une structure responsive sûre et rediriger vers l’authentification;
- routes protégées avec `storageState/auth.json` : elles valident les vraies pages applicatives.

Après génération du fichier `storageState/auth.json`, les tests responsive peuvent accéder aux pages protégées si l’application accepte la session sauvegardée.

## CI responsive smoke

Le workflow suivant exécute les tests responsive :

```text
.github/workflows/ci.yml
```

La CI publique exécute les tests responsive publics avec `TEST_BASE_URL`. La CI authentifiée s’active seulement si les secrets ou variables E2E nécessaires sont configurés.

Le rapport Playwright HTML est publié comme artefact pendant 7 jours.

## Règles

- Données de test seulement.
- Aucun secret réel.
- Aucun fichier de session réelle commité.
- Aucun rapport Playwright généré commité.

## Statut

Fondation et certification E2E V1 fusionnées. Le dépôt est en évolution continue : maintien des parcours critiques, couverture des intégrations entre grands modules et prévention des régressions multi-organisation et responsive.