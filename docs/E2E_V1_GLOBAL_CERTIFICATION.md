# Certification globale E2E V1

## But

Prouver que MADSuite fonctionne comme un seul système cohérent à travers le backend, le frontend, l’agent de bureau et les parcours de bout en bout.

## Matrice obligatoire

- authentification et récupération de session;
- isolation entre organisations;
- clients, projets et suivi du temps;
- soumissions, factures et paiements;
- comptabilité;
- paie;
- inventaire;
- fournisseurs et achats;
- tableau de bord décisionnel;
- portails publics sécurisés;
- responsive et accessibilité;
- contrat du Desktop Agent;
- récupération après erreur et observabilité.

## Conditions de certification

1. chaque suite est exécutée dans un environnement de staging isolé;
2. les commits exacts des quatre dépôts sont enregistrés;
3. aucun test critique n’est ignoré dans la décision finale;
4. les échecs conservent traces, captures et journaux;
5. l’isolation multi-organisation est vérifiée par l’interface et par l’API;
6. la décision finale est approuvée par une personne identifiée.

## Décision

- `certified` : toute la matrice est verte et les preuves sont complètes;
- `blocked` : une suite manque, échoue, est ignorée ou n’est pas liée aux bons commits.

Cette certification ne remplace pas la surveillance après publication. Elle constitue la preuve reproductible de la version candidate testée.
