# Plan E2E — customer_growth

## Objet

Définir les preuves de bout en bout du parcours `Prospect → Opportunité → Client → Projet ou devis` avant l’implémentation des scénarios Playwright.

## Environnements

- exécution uniquement sur environnement de test ou staging isolé;
- organisations A et B créées séparément;
- aucune utilisation de la production;
- données créées par le test et nettoyées selon les conventions du dépôt.

## Parcours principal

1. créer un utilisateur et une organisation A;
2. créer un prospect;
3. ajouter une activité;
4. qualifier le prospect;
5. créer une opportunité;
6. faire évoluer l’opportunité jusqu’à gagnée;
7. convertir le prospect vers un client;
8. convertir l’opportunité vers un projet ou un devis;
9. recharger la page et confirmer la persistance;
10. vérifier les ressources produites dans leurs modules existants.

## Isolation multi-organisation

Avec l’organisation B :

- aucune ressource A ne doit apparaître dans l’interface;
- les identifiants A appelés directement doivent retourner `403` ou `404` selon le contrat;
- aucune activité, client, projet ou devis A ne doit être lisible;
- la session B doit rester active après les refus;
- les événements temps réel ne doivent pas traverser les salons d’organisation.

## Concurrence et idempotence

- double clic de conversion;
- double requête avec la même clé d’idempotence;
- seconde requête avec une clé différente après conversion;
- conflit de version `409`;
- répétition après interruption réseau simulée;
- confirmation qu’une seule ressource finale est créée.

## Permissions

Tester au minimum :

- administrateur autorisé;
- employé selon matrice finale;
- lecture seule refusée sur les mutations;
- utilisateur sans organisation refusé;
- module désactivé refusé proprement.

## États terminaux

- prospect disqualifié non convertible;
- opportunité perdue non convertible;
- ressource supprimée logiquement introuvable;
- conversion déjà faite retournant un résultat cohérent;
- aucune suppression automatique du client, projet ou devis produit lors d’un retour arrière du module.

## Matrice navigateurs

- Chromium bureau;
- Chromium mobile;
- WebKit mobile;
- un seul travailleur pour les scénarios transactionnels sensibles;
- parallélisme permis seulement pour les scénarios isolés.

## Preuves à conserver

- rapport HTML Playwright;
- captures uniquement en cas d’échec;
- traces sur premier retry;
- journaux sans secrets ni jetons;
- résultat explicite des vérifications API cross-tenant.

## Découpage proposé

- PR 1 : fabriques et helpers API;
- PR 2 : parcours principal;
- PR 3 : isolation multi-organisation;
- PR 4 : permissions et module désactivé;
- PR 5 : concurrence, idempotence et reprise réseau;
- PR 6 : matrice mobile et accessibilité critique.

## Blocages actuels

- routes backend finales non publiées;
- sélecteurs frontend non disponibles;
- matrice de rôles à confirmer;
- environnement staging à vérifier avant exécution.
