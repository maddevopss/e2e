# Preuve E2E — Portail public de facture et PDF V1

Le scénario `tests/public-invoice-portal-pdf-v1.spec.js` prouve :

```text
organisation A
→ facture finalisée
→ lien public opaque
→ consultation sans session
→ mêmes lignes et montants
→ téléchargement PDF valide
→ rotation du lien
→ ancien lien refusé
→ organisation B refusée
→ révocation immédiate
→ lien inconnu refusé
→ facture brouillon non publiable
```

## Assertions de sécurité

- jeton public au format base64url de 43 caractères;
- aucune donnée `organisation_id`, `client_id` ou `time_entry_id` dans la réponse publique;
- en-têtes `no-store` et `noindex`;
- PDF avec type `application/pdf` et nom de fichier neutralisé;
- même 404 pour ancien, révoqué et inconnu;
- création inter-organisation refusée;
- brouillon refusé avec conflit métier.

La suite doit s'exécuter seulement sur la pile E2E isolée, jamais sur la production.
