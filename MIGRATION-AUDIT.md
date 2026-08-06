# Audit de Migration - Kephale Backend vers Prisma Compute

Ce document synthétise l'état initial du backend de l'application Kephale avant sa migration vers un déploiement sécurisé sur Prisma Compute, comme demandé lors de l'étape 0.

## 1. Structure du Repository
- **Type** : Le dépôt est configuré en monorepo géré par Turborepo (`turbo.json` présent à la racine).
- **Projets liés** : On retrouve `apps/backend`, `apps/mobile`, `packages/database`, et `packages/types`.
- **Emplacement du Schéma Prisma** : Le fichier `schema.prisma` n'est **pas** dans l'application backend directement, mais se trouve dans `packages/database/prisma/schema.prisma`.
- **Dossier .prisma** : Le dossier `.prisma/local.json` existe à la racine du monorepo et lie l'environnement de développement local à un projet Compute (`wksp_rdrt0dga4766dni0jmf92tio`, `proj_cmsar7af64ch20xgivv09rzso`).

## 2. Serveur HTTP et Framework (apps/backend/src/server.ts)
- **Framework** : L'application utilise **Fastify** exécuté via **Bun** (`tsx` est utilisé en local mais le runtime cible reste Bun selon les instructions Prisma Compute).
- **Port d'écoute** : Le port est configuré via `process.env.PORT` avec un fallback sur `4000`.
- **Route Health** : Il existe bien une route `/health` qui valide la connexion à la base de données (via `prisma.$queryRaw`) et à Redis (via `redis.ping()`).
- **Composants persistants (Long-lived)** : L'application inclut des websockets via `Socket.IO` configuré sur la même instance Fastify, des tâches planifiées (`src/cron/index.ts`) et des files d'attente BullMQ (`src/queues/index.ts`). Ces composants nécessitent un processus persisté, ce qui est totalement compatible avec Prisma Compute.

## 3. Configuration des paquets (package.json)
- **apps/backend/package.json** : 
  - Dépendances : `@prisma/client` est bien défini en tant que `dependencies` (et non `devDependencies`).
  - Scripts : Les scripts incluent `dev` (avec `tsx watch src/server.ts`) et `build` (`tsc`). Il n'y a **aucun script manuel obsolète** de copie de binaires (`.so.node`).
- **packages/database/package.json** :
  - Dépendances : Contient `@prisma/client`, `@prisma/adapter-pg` (qui est essentiel pour le driver adapter).
  - DevDependencies : `prisma` CLI est présent.
  - Scripts : Le script de build inclut `db:generate` pointant correctement vers le schéma Prisma du package.

## 4. Variables d'Environnement
Toutes les variables utilisées dans le code (identifiées par recherche de `process.env`) sont correctement documentées dans le fichier `.env.example`. Cela inclut :
- `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`
- Variables JWT (`JWT_SECRET`, etc.)
- Services Tiers : Google OAuth, AWS S3, Stripe, CinetPay, LiveKit, Resend, etc.
Il n'y a aucun écart significatif identifié.

## 5. Migrations existantes (packages/database/prisma/migrations)
- **Nombre de migrations** : 4 migrations (`init`, `add_local_auth`, `add_albums_artist_enhancements`, `add_migration_docker_app`).
- **Risque** : Ces migrations représentent de véritables évolutions de schéma appliquées à une base de données potentiellement existante. L'utilisation de `prisma db push` (le comportement par défaut de Prisma Compute) sur cette base présente un risque élevé de suppression ou de recréation de tables s'il y a un décalage entre la structure et l'historique des migrations.
- **Action Requise** : L'application de la commande `prisma migrate deploy` (et éventuellement un `migrate status`) doit impérativement précéder tout déploiement sur Compute pour éviter les pertes de données.

## 6. Framework : Décision
Conformément aux directives et suite à l'audit, **Fastify sera conservé**. Aucune incompatibilité fondamentale n'a été détectée avec Prisma Compute, qui supporte le framework via un démarrage d'application standard Node.js/Bun. Les plugins critiques (WebSockets, routes raw pour Stripe) sont tous correctement pris en charge par Fastify dans un processus long.
