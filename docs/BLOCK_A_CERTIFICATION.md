# Bloc A — Certification transversale

Le scénario `tests/block-a-certification.spec.js` vérifie sur un environnement isolé :

- la santé de l’API;
- la persistance de la session protégée;
- la présence d’un repère principal accessible;
- la navigation clavier;
- l’absence de débordement horizontal sur un écran mobile;
- la reprise après rechargement.

Activation : `E2E_BLOCK_A_CERTIFICATION=1` avec une session authentifiée préparée par les mécanismes E2E existants.

La mesure de performance détaillée et les essais de charge restent des preuves d’exploitation distinctes; ce scénario fixe la porte fonctionnelle transversale minimale.
