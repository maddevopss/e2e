# MADSuite E2E

Dépôt officiel des tests end-to-end MADSuite.

## Source de vérité

```text
bleeband/SYSTEME_MAD
```

## Rôle

Ce dépôt validera les parcours critiques MADSuite : authentification, onboarding, clients, projets, temps, factures, estimés, portail, modules et isolation organisation.

## Stack recommandée

- Playwright
- Node.js
- dotenv

## Structure prévue

```text
tests/
fixtures/
helpers/
storageState/
```

## Commandes prévues

```bash
npm install
npm test
npm run test:headed
npm run test:ui
npm run report
```

## Règles

- Données de test seulement.
- Pas de fichiers de session réelle.
- Pas de valeurs privées.
- Tests stables et orientés parcours métier.

## Statut

Réservé / à initialiser.
