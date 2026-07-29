# Priorité 2 — Certification des cycles métier transversaux

## Intention

Certifier MADSuite par des parcours complets qui traversent plusieurs modules, plutôt que par une accumulation de tests isolés d’écrans ou de routes.

Une certification n’est valide que si le scénario est exécuté sur les services réels, avec une base PostgreSQL migrée, une organisation authentifiée, des preuves conservées et une décision humaine finale.

## Règles communes

Chaque scénario doit démontrer :

- l’isolation stricte par organisation;
- l’idempotence des opérations sensibles;
- l’absence de recalcul d’autorité dans le navigateur;
- la traçabilité jusqu’aux données sources;
- la conservation des événements métier;
- les refus explicables;
- la reprise après interruption;
- la correction par opération compensatoire lorsque l’historique doit rester immuable;
- la confirmation humaine avant toute décision irréversible;
- la cohérence entre l’interface, l’API, la base et les projections décisionnelles.

## Cycle A — Vente et comptabilité

Parcours obligatoire :

1. créer un client;
2. créer un projet ou un mandat;
3. produire une soumission lorsque le module est actif;
4. convertir ou créer une facture;
5. finaliser la facture;
6. enregistrer un paiement partiel puis complet;
7. constater les écritures comptables produites;
8. retrouver la source depuis le journal et le grand livre;
9. vérifier la balance de vérification;
10. vérifier l’état des résultats, le bilan et les flux de trésorerie;
11. fermer la période;
12. prouver qu’une nouvelle écriture dans la période fermée est refusée;
13. rouvrir avec justification et preuve humaine lorsque le scénario l’exige.

## Cycle B — Fournisseur, achat, inventaire et comptabilité

Parcours obligatoire :

1. qualifier un fournisseur;
2. créer une demande d’achat justifiée;
3. approuver la demande avec séparation des responsabilités;
4. créer un bon de commande;
5. effectuer une réception partielle;
6. constater le mouvement d’inventaire;
7. effectuer la réception finale;
8. enregistrer une facture fournisseur;
9. exécuter le rapprochement commande–réception–facture;
10. provoquer puis résoudre un écart contrôlé;
11. planifier et confirmer le paiement;
12. constater les écritures comptables;
13. vérifier la mise à jour du tableau décisionnel.

## Cycle C — Paie, paiement, remises et comptabilité

Parcours obligatoire :

1. créer un dossier employé;
2. activer un contrat approuvé;
3. ouvrir une période et un cycle de paie;
4. ajouter les éléments variables avec provenance;
5. calculer le brut, les retenues, les cotisations et le net;
6. faire réviser puis approuver par des personnes distinctes;
7. produire le talon et le registre;
8. préparer puis confirmer le dépôt direct;
9. créer puis payer les remises gouvernementales;
10. publier l’écriture comptable;
11. rapprocher le cycle, les dépôts et les remises;
12. prouver qu’une correction d’un cycle payé conserve l’historique.

## Cycle D — Inventaire, réservation et coût des ventes

Parcours obligatoire :

1. recevoir un article;
2. vérifier la quantité disponible;
3. réserver une partie du stock;
4. provoquer une tentative de surallocation concurrente;
5. consommer la réservation;
6. sortir le stock;
7. constater le coût des ventes et l’écriture comptable;
8. effectuer un comptage physique;
9. traiter un écart avec séparation préparateur–approbateur;
10. confirmer la nouvelle valorisation.

## Cycle E — Continuité cognitive

Chaque cycle A à D doit inclure au moins une interruption volontaire :

1. enregistrer l’objectif courant;
2. enregistrer la dernière étape terminée;
3. enregistrer la prochaine action;
4. fermer la session ou changer d’appareil;
5. reprendre le parcours depuis le contexte conservé;
6. vérifier que le contexte est encore valide;
7. fermer ou remplacer le point de reprise après accomplissement.

## Preuves minimales

Chaque exécution certifiée doit conserver :

- identifiant du scénario;
- commits backend, frontend et E2E;
- version du schéma;
- organisation de test;
- horodatage de début et de fin;
- jeux de données utilisés;
- captures ou traces des étapes critiques;
- identifiants des écritures et événements produits;
- refus attendus observés;
- anomalies rencontrées;
- résultat final;
- approbation humaine;
- référence vers les artefacts CI.

## États de certification

- `not_run` : scénario défini, jamais exécuté sur l’ensemble de commits visé;
- `failed` : au moins une exigence obligatoire échoue;
- `partial` : parcours terminé, mais une preuve ou une validation manque;
- `passed` : parcours et preuves complets;
- `revoked` : une régression ou une incompatibilité invalide une certification précédente.

## Interdictions

Une certification ne peut pas être déclarée réussie uniquement parce que :

- les fichiers existent;
- les routes sont montées;
- les tests unitaires passent;
- une PR porte le mot « fermeture »;
- la CI d’un seul dépôt est verte;
- le scénario utilise des données simulées sans base réelle.

## Porte de fermeture

La priorité 2 est fermée uniquement lorsque les cycles A à E sont exécutés sur le même ensemble de commits, que les preuves sont conservées et qu’aucune anomalie critique n’est ouverte.