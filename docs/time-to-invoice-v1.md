# Facturation depuis les heures V1 — contrat de preuve

Le scénario `tests/time-to-invoice-v1.spec.js` vérifie :

- la sélection de deux entrées terminées et non facturées;
- le calcul cohérent des heures, du sous-total, des taxes et du total;
- la création transactionnelle d’une seule facture;
- le lien entre facture, lignes et entrées de temps;
- la disparition immédiate des heures déjà facturées;
- l’idempotence de la commande;
- l’absence de fuite vers une deuxième organisation.

La validation full-stack doit s’exécuter uniquement contre l’environnement de test isolé.
