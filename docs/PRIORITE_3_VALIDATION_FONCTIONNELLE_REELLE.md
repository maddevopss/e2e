# Priorité 3 — Validation fonctionnelle réelle

## Intention

Vérifier que MADSuite peut soutenir les opérations réelles d’une entreprise, et non seulement répondre correctement à des appels techniques isolés.

## Profils de validation

### Profil A — Travailleur autonome

- 1 organisation;
- 1 à 3 utilisateurs;
- 40 clients;
- 25 projets actifs;
- 500 factures historiques;
- 4 fournisseurs;
- comptabilité mensuelle;
- aucune paie ou une seule personne salariée.

### Profil B — Petite entreprise

- 5 à 15 employés;
- rôles distincts;
- 100 clients;
- 20 fournisseurs;
- inventaire sur 2 emplacements;
- paie régulière;
- approbations séparées;
- plusieurs milliers d’écritures comptables.

### Profil C — PME

- 30 à 100 employés;
- plusieurs services;
- plusieurs comptes bancaires;
- plusieurs emplacements;
- inventaire avec lots ou séries;
- approvisionnement structuré;
- paie, remises et fins d’année;
- volume important de documents et d’événements.

## Épreuves obligatoires

### Données et migrations

- migration sur base vide;
- migration sur copie anonymisée d’une base existante;
- nouvelle exécution idempotente des migrations;
- validation de toutes les contraintes;
- validation RLS et FORCE RLS;
- restauration d’une sauvegarde puis reprise des traitements.

### Concurrence

- deux réservations sur le dernier stock disponible;
- deux publications d’une même écriture;
- deux paiements sur le même solde fournisseur;
- deux approbations concurrentes;
- deux créations avec la même clé d’idempotence;
- fermeture de période pendant une tentative d’écriture.

### Défaillances

- coupure réseau après envoi mais avant réponse;
- redémarrage backend pendant une transaction;
- traitement d’arrière-plan interrompu;
- événement dupliqué;
- réponse tardive d’un service externe;
- fichier exporté partiellement;
- session expirée pendant une opération sensible.

### Corrections

- facture annulée après publication;
- paiement renversé;
- écriture comptable contrepassée;
- paie payée corrigée sans modifier l’historique;
- réception fournisseur corrigée;
- inventaire physique avec écart;
- recommandation refusée par la personne responsable.

### Confidentialité et isolation

- lecture croisée entre deux organisations refusée;
- mutation croisée refusée;
- identifiants devinés refusés;
- exports limités à l’organisation active;
- données salariales visibles uniquement selon les permissions;
- journaux sans secret, jeton ou donnée bancaire complète.

## Critères de réussite

Une épreuve réussit seulement si :

- aucune corruption ou perte silencieuse n’est observée;
- les transactions incomplètes sont annulées ou reprises de façon contrôlée;
- les doublons sont neutralisés;
- l’état affiché correspond à l’état serveur;
- les projections sont recalculées depuis les sources officielles;
- chaque refus est compréhensible;
- chaque correction conserve une piste vérifiable;
- les preuves sont attachées au commit testé.

## Mesures minimales

- durée du scénario;
- nombre d’opérations;
- nombre de requêtes échouées;
- nombre de reprises;
- nombre de doublons neutralisés;
- temps de récupération;
- écarts comptables ou de stock;
- alertes critiques ouvertes;
- consommation de mémoire et temps de réponse aux seuils retenus.

## Porte de fermeture

La priorité 3 est fermée lorsque les profils A et B sont entièrement validés, que les épreuves de concurrence et de défaillance passent, et que le profil C possède au minimum une validation de charge documentée sans anomalie critique ouverte.