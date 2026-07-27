# Preuve de fermeture — Comptabilité

## Commande

```bash
npm run test:accounting-closure
```

## Conditions

- frontend et backend E2E accessibles;
- base PostgreSQL migrée;
- inscriptions de test autorisées;
- organisations de test isolées;
- utilisateur créé avec les permissions administratives prévues par l’onboarding.

## Chaîne vérifiée

1. création de l’organisation A;
2. initialisation du plan comptable;
3. création de deux périodes;
4. création d’une écriture équilibrée de 125,50 $ CA;
5. publication de l’écriture;
6. consultation du détail et validation débit = crédit;
7. présence dans le grand livre;
8. présence dans la balance comparative;
9. production de l’état des résultats, du bilan et du flux de trésorerie;
10. production des exports CSV;
11. contrepassation traçable;
12. fermeture puis réouverture de la période;
13. création de l’organisation B;
14. refus de lecture de l’écriture de A et absence dans le grand livre de B.

## Règle de constat

Ce document décrit une preuve exécutable. Il ne constitue pas à lui seul un résultat réussi. La fermeture définitive exige une exécution verte du scénario sur l’environnement visé.
