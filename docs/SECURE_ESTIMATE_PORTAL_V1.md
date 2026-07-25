# Preuve E2E — Soumissions publiques sécurisées V1

Le scénario `tests/secure-estimate-portal-v1.spec.js` vérifie dans une pile réelle :

1. une soumission envoyée et ses lignes;
2. la création d’un jeton opaque de 256 bits;
3. la rotation et l’invalidation immédiate du premier lien;
4. le refus de l’ancien UUID `public_token`;
5. une réponse publique sans identifiants internes;
6. le refus d’une acceptation sans consentement;
7. l’acceptation avec nom, consentement et horodatage;
8. la répétition idempotente de la même décision;
9. le refus d’une décision contradictoire;
10. une seule facture créée depuis la soumission acceptée;
11. la répétition idempotente de la conversion;
12. la révocation immédiate du lien;
13. le refus d’une seconde soumission et l’impossibilité de la convertir;
14. l’isolation entre deux organisations.

Le scénario utilise seulement la pile E2E et ne doit jamais cibler la production.