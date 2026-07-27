# Bloc E — Validation comptable de bout en bout

Issue : #57

## Résultat attendu

Le module complet est prouvé dans un environnement réel avec PostgreSQL, backend, frontend et deux organisations isolées.

## Parcours obligatoire

1. initialiser le plan comptable et une période;
2. finaliser une facture;
3. recevoir un paiement;
4. enregistrer une dépense;
5. enregistrer une facture et un paiement fournisseur;
6. publier une paie;
7. vérifier journal, grand livre et balance;
8. vérifier résultats, bilan et trésorerie;
9. contrepasser une écriture;
10. clôturer une période;
11. confirmer l’isolation de l’organisation B;
12. télécharger les exports.

## Preuves avant fusion

- navigateur réel;
- appels HTTP réels;
- base PostgreSQL réelle;
- assertions sur les écritures et soldes;
- aucune donnée croisée entre organisations;
- artefacts de test conservés en cas d’échec.

Cette PR reste en brouillon jusqu’à réussite complète de la matrice.