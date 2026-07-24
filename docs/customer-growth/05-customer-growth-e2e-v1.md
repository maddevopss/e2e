# Parcours prospect vers client — validation E2E V1

## Intention

Prouver dans un navigateur réel que le parcours commercial complet fonctionne sans fuite entre organisations.

## Scénario principal

1. créer une organisation A et un administrateur;
2. créer un prospect;
3. le faire passer de nouveau à contacté, puis à suivre;
4. ajouter une note et un rappel;
5. marquer le rappel comme terminé;
6. qualifier le prospect;
7. convertir le prospect en client;
8. vérifier que le client est visible et que le prospect est converti;
9. répéter la conversion et confirmer l’idempotence;
10. créer une organisation B et vérifier l’absence totale des données de A.

## Matrice minimale

- Chromium bureau;
- Chromium mobile;
- WebKit mobile si le temps d’exécution CI demeure acceptable.

## Preuves attendues

- statuts et boutons cohérents;
- organisation jamais fournie par le navigateur;
- appels API sensibles refusés entre organisations;
- chronologie et rappels correctement ordonnés;
- conversion unique malgré une répétition;
- session de l’organisation B intacte après les refus d’accès;
- aucune donnée de A visible dans l’interface ou les réponses API de B.

## Stratégie de test

- données uniques par exécution;
- sélecteurs accessibles et stables;
- attentes fondées sur les réponses réseau plutôt que des délais arbitraires;
- nettoyage ou isolation par base de données dédiée;
- captures et traces uniquement en cas d’échec.

## Dépendances

À traiter après les quatre lots backend et frontend.

## Hors portée

- facturation complète après conversion;
- performance à grande échelle;
- automatisations de courriel.
