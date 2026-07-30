# Portée des preuves P0 MADSuite

## Rôle du dépôt

Ce dépôt produit les preuves inter-dépôts. Une suite verte doit démontrer un parcours réel entre le frontend, le backend, PostgreSQL et les services simulés nécessaires.

## Preuves actuellement couvertes

Le scénario financier P0 valide notamment :

- inscription et session réelle;
- webhook Stripe signé;
- rejeu idempotent du même événement;
- facture marquée payée;
- unicité de l’événement de paiement;
- unicité de l’écriture ledger;
- cohérence du dashboard API et UI.

## Limite connue

La création du client et de la facture du scénario financier utilise actuellement des insertions SQL. Cette approche prouve la chaîne webhook, ledger et dashboard, mais ne prouve pas encore entièrement :

- la création de facture par l’API métier;
- la finalisation par le service applicatif;
- la création du lien de paiement;
- les validations d’autorisation de ces opérations.

Le ticket financier ne doit donc être fermé complètement qu’après une preuve utilisant les interfaces métier réelles ou une justification MADPROOF explicite de cette limite.

## Hiérarchie des preuves

1. **Preuve UI complète** : parcours utilisateur par le navigateur.
2. **Preuve API** : appel aux routes réelles avec authentification.
3. **Preuve intégration** : backend et PostgreSQL réels, service externe simulé fidèlement.
4. **Préparation SQL** : autorisée pour préparer un état précis, mais elle ne remplace pas la preuve de la logique métier contournée.

Chaque test doit indiquer clairement le niveau de preuve fourni.

## Matrice P0 à compléter localement

### Finance

- facture créée et finalisée par API ou UI;
- événement Stripe invalide;
- montant incohérent;
- événement livré dans le désordre;
- rejeu concurrent;
- rollback transactionnel;
- absence d’écriture ledger partielle.

### Multi-tenant

- lecture, modification et suppression inter-organisation refusées;
- RLS direct avec contexte absent, valide et falsifié;
- isolation Socket.IO;
- isolation crons et outbox;
- isolation exports, notifications, métriques et ledger.

### Reprise

- exécution après restauration d’une sauvegarde PostgreSQL dans une base vierge;
- vérification des contraintes et politiques RLS restaurées.

## Critères de preuve CI

- aucun skip silencieux du workflow P0;
- readiness explicite de PostgreSQL, backend et frontend;
- identifiant unique par run;
- aucun secret ou jeton dans les logs;
- rapport Playwright et traces publiés en cas d’échec;
- référence du run vert conservée dans SYSTEME_MAD.

## Règle de fermeture

Un test présent dans le dépôt n’est pas automatiquement une preuve acceptée. La preuve doit avoir été exécutée dans un environnement propre, produire un résultat consultable et couvrir la couche revendiquée.
