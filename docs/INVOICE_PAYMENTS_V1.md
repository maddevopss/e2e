# Preuve E2E — Encaissements et paiements partiels V1

Le scénario `tests/invoice-payments-v1.spec.js` vérifie dans une pile réelle :

1. une facture envoyée et finalisée de 100,00 $;
2. un premier paiement de 40,00 $;
3. un solde serveur de 60,00 $;
4. une répétition avec la même clé reconnue comme doublon;
5. une seule ligne de paiement et une seule écriture au grand livre;
6. un surpaiement de 61,00 $ refusé;
7. un second paiement de 60,00 $;
8. le passage automatique de la facture à `paid`;
9. un solde final de 0,00 $;
10. la disparition de la facture des relances;
11. le refus de lecture et d’écriture depuis une autre organisation.
