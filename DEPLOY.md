# Procédure de Déploiement - Kephale (Prisma Compute)

Ce document décrit la procédure sécurisée pour déployer l'application Kephale sur Prisma Compute.

## 1. Prérequis et Sécurité des Migrations

Prisma Compute utilise `prisma db push` par défaut lors du déploiement. Sur une base de données avec des données réelles et un historique de migrations (`prisma/migrations`), cela peut être destructif si la base n'est pas synchronisée avec le schéma.

**Action obligatoire AVANT tout déploiement en production :**
Vous devez vous assurer que la base de données cible est à jour par rapport aux migrations.

1. Appliquez les migrations sur votre base de production :
   ```bash
   # Depuis la racine du monorepo
   cd packages/database
   DATABASE_URL="votre_url_de_prod" npx prisma migrate deploy
   ```
2. Vérifiez le statut des migrations localement via le script dédié :
   ```bash
   cd apps/backend
   DATABASE_URL="votre_url_de_prod" npx tsx scripts/verify-migrations.ts
   ```
   Ce script doit afficher `✅ All migrations are applied. Safe to proceed...` avant de lancer un déploiement. S'il échoue, le déploiement sur Compute risque de corrompre les données.

## 2. Déploiement sur une branche Preview

Ne déployez **jamais** directement en production (`main`) sans avoir validé les modifications sur un environnement de Preview.

1. Poussez votre code sur une branche de preview (ex: `feat/compute-migration`).
2. Déployez l'application sur Prisma Compute avec les variables d'environnement de test.
3. Vérifiez les logs du déploiement. L'étape `Applying schema with prisma db push…` ne doit montrer aucune modification de table (puisque `migrate deploy` a déjà fait le travail).

## 3. Variables d'Environnement et Secrets

La plupart des variables sont documentées dans `.env.example`. Lors du premier déploiement via CLI, fournissez les variables via `--env .env`.

**Attention aux secrets** :
Les clés suivantes doivent être traitées comme des secrets sensibles (idéalement gérées via l'interface de Prisma Compute ou un gestionnaire de secrets) et non commitées :
- `DATABASE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `AWS_SECRET_ACCESS_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `LIVEKIT_API_SECRET`
- `EXCHANGE_RATE_API_KEY`, `RESEND_API_KEY`
- `ACRCLOUD_ACCESS_SECRET`, `AUDD_API_KEY`
- Clés privées CinetPay, etc.

## 4. Vérification Post-Déploiement (Health Check)

Une fois déployé :
1. Interrogez l'URL `/health` du serveur déployé :
   ```bash
   curl https://<votre-url-compute>/health
   ```
   Vous devriez obtenir un `200 OK` avec `{"status":"ok",...}` attestant que Redis et la DB sont connectés.
2. Testez un endpoint critique (ex: WebSocket ou Auth) pour valider le fonctionnement réseau du process `bun` long-lived.
3. Si tout est validé, vous pouvez fusionner sur `main` pour déclencher le déploiement en production.

> [!WARNING]
> Ne jamais exécuter de commandes destructrices comme `migrate reset` ou `db push --accept-data-loss` contre une base de production sans confirmation manuelle.

## 5. Troubleshooting (Problèmes Connus)

### Erreur WASM en environnement Monorepo (`ENOENT query_compiler_bg.wasm`)
Il existe un bug connu (avril 2026) avec l'utilisation de `queryCompiler` et `driverAdapters` dans un monorepo où le schéma est dans un package séparé (ex: `packages/database`) et consommé par une application (ex: `apps/backend`). Le client Prisma peut chercher le fichier WASM dans le mauvais répertoire, provoquant une erreur `ENOENT`.

**Symptôme :**
Erreur au runtime lors de la première requête (ex: sur `/health`) :
`ENOENT: no such file or directory, open '.../apps/backend/.../query_compiler_bg.wasm'`

**Workaround (Plan de repli) :**
Si cette erreur se présente sur votre environnement Preview, retirez `queryCompiler` de vos `previewFeatures` dans `packages/database/prisma/schema.prisma` tout en gardant `driverAdapters` :

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"] // queryCompiler retiré
  // Si le moteur natif fait encore défaut, réintroduire : binaryTargets = ["native"]
}
```
Relancez la génération et redéployez. Sur Prisma Compute, l'environnement de build propre devrait correctement gérer le moteur natif dans ce cas de figure.
