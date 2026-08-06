# 🔍 Analyse Complète — Kephale Platform

> Rapport d'audit technique complet du projet. Classement par priorité : 🔴 Critique · 🟠 Important · 🟡 Amélioration

---

## 📊 Vue d'ensemble du projet

Kephale est une plateforme de streaming musical multi-devises africaine. La stack est bien choisie (Fastify, Prisma, Redis, BullMQ, LiveKit, Expo), la structure monorepo Turborepo est propre, et l'architecture est cohérente avec les ambitions du produit.

Le code montre un bon niveau de maturité pour une V1, mais plusieurs zones méritent une attention immédiate avant tout passage en production.

---

## 🔴 Critiques — À corriger avant production

### 1. Sécurité · `(request as any).user` — Absence de typage fort sur le JWT

**Fichier** : [`middleware/auth.ts`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/middleware/auth.ts) + tous les routes

Le cast `(request as any).user` est répété dans **chaque route** (~50 occurrences). Si `authenticate()` n'est pas appelé en `preHandler`, il n'y a **aucune erreur TypeScript** et `user` sera `undefined` → crashs silencieux ou failles d'autorisation.

**Fix** : Déclarer un type global Fastify pour augmenter `FastifyRequest` :
```typescript
// src/types/fastify.d.ts
declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}
```
Et remplacer tous les `(request as any).user` par `request.user`.

---

### 2. Sécurité · CORS trop permissif sur Socket.IO

**Fichier** : [`server.ts:152`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/server.ts#L151-L154)

```typescript
// ❌ Actuel
cors: { origin: '*', methods: ['GET', 'POST'] }
```
En prod, `origin: '*'` expose le WebSocket à n'importe qui. À restreindre à `process.env.FRONTEND_URL`.

---

### 3. Sécurité · Log du mot de passe en clair (CRITIQUE)

**Fichier** : [`services/auth.service.ts:131`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/auth.service.ts#L131)

```typescript
// ❌ DANGER — mot de passe affiché dans les logs
console.log('Login failed: invalid password', { email: data.email, providedPassword: data.password });
```
**Ce log doit être supprimé immédiatement.** Il expose le mot de passe de l'utilisateur en clair dans tous les logs (serveur, Sentry, Railway...).

---

### 4. Sécurité · Simulation d'achat en production active

**Fichier** : [`routes/payments.ts:119-133`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/payments.ts#L119-L133)

```typescript
// ❌ TEMPORAIRE non protégé — crédite les tokens sans paiement réel
// À remplacer plus tard par la logique CinetPay / Stripe.
await prisma.user.update({ data: { tokenBalance: { increment: pack.tokens } } });
```
Ce code est actif en production. Il suffit d'appeler `POST /api/v1/payments/buy-tokens` pour obtenir des tokens **gratuitement**. Le bloquer derrière `NODE_ENV !== 'production'` au minimum.

---

### 5. Sécurité · Pas de vérification idempotence sur le webhook Stripe (duplicate processing)

**Fichier** : [`routes/payments.ts:685-708`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/payments.ts#L685-L708)

Le webhook Stripe `TRACK_PURCHASE` crée la `Purchase` **sans vérifier si elle existe déjà** (contrairement au webhook CinetPay qui a ce contrôle). Un double-envoi Stripe → double crédit artiste et double `Purchase`.

**Fix** : Ajouter `findFirst` avant chaque `purchase.create` dans la section Stripe, exactement comme pour CinetPay.

---

### 6. Sécurité · `require('jsonwebtoken')` dans un fichier ES Modules

**Fichier** : [`routes/videos.ts:65`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/videos.ts#L65), [`routes/lives.ts:348`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/lives.ts#L348)

```typescript
const jwt = require('jsonwebtoken'); // ❌ CommonJS require dans ESM
```
Ce pattern fonctionne mais est fragile. Il duplique la logique d'auth déjà dans `middleware/auth.ts`. Extraire une fonction utilitaire `extractOptionalUser(request)` réutilisable.

---

### 7. Robustesse · Viewer count jamais décrémenté

**Fichier** : [`routes/lives.ts:172-175`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/lives.ts#L172-L175)

```typescript
// Le viewerCount s'incrémente à chaque join()...
data: { viewerCount: { increment: 1 } },
// ...mais il n'y a aucun decrement sur leave/disconnect.
```
Le compteur va s'emballer et afficher des chiffres faux. À gérer via Socket.IO `disconnect` event ou un compteur Redis (TTL-based).

---

### 8. Robustesse · Donation dupliquée possible (REST + Socket.IO)

Il existe **deux chemins** pour envoyer un don :
- `POST /api/v1/lives/:id/gift` (route REST)
- `socket.on('live:donate', ...)` (Socket.IO)

Les deux exécutent des transactions indépendantes. Un client malveillant ou un bug réseau peut déclencher les deux → double débit de tokens, double crédit artiste.

**Fix** : Garder uniquement le chemin Socket.IO, ou ajouter une clé d'idempotence (ex: `donationNonce` unique par client).

---

## 🟠 Importants — À traiter dans les prochains sprints

### 9. Performance · `require('jsonwebtoken')` dans une boucle de requêtes

Le `require()` synchrone dans chaque requête `GET /videos` et `GET /lives` est un anti-pattern. Même si Node.js met en cache les modules, appeler `require()` à chaque request est inutile. Passer à un import ES Module en haut du fichier.

---

### 10. Performance · Algorithme "For You" — chargement DB excessif

**Fichier** : [`routes/videos.ts:92-117`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/videos.ts#L106-L117)

```typescript
// Pour chaque catégorie, on charge TOUS les IDs (potentiellement des milliers)
const allIds = await prisma.video.findMany({ where: condition, select: { id: true } });
```
Avec 10 000 vidéos, cela charge 10 000 IDs en mémoire pour un shuffle côté Node.js. Utiliser `TABLESAMPLE` PostgreSQL ou une procédure stockée `ORDER BY RANDOM() LIMIT n` directement en SQL.

---

### 11. Performance · Vue count doublement incrémentée

**Fichier** : [`routes/videos.ts:328`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/videos.ts#L327-L328) + [`routes/videos.ts:502-509`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/videos.ts#L496-L510)

`GET /videos/:id` incrémente `views` **et** `POST /videos/:id/watch` l'incrémente aussi. Une lecture compte double. La route GET devrait seulement retourner la donnée; la route `watch` gère le comptage.

---

### 12. Performance · Auth store — AsyncStorage est lent

**Fichier** : [`mobile/src/stores/index.ts:3`](file:///Users/paulkone/Desktop/app/app-kephale/apps/mobile/src/stores/index.ts#L3)

L'architecture prévoit MMKV (ultra-rapide), mais l'implémentation utilise `AsyncStorage` (lent, non chiffré). Migrer vers `react-native-mmkv` comme prévu dans l'architecture.

```typescript
// ✅ Recommandé
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV({ id: 'kephale-auth', encryptionKey: 'your-key' });
```

---

### 13. Performance · Rate limit global trop bas (100 req/min)

**Fichier** : [`server.ts:60-65`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/server.ts#L60-L65)

100 requêtes/minute pour **tout le serveur** est trop restrictif pour une app mobile avec streaming. L'utilisateur qui scroll les reels va atteindre cette limite. Implémenter un rate limit **par route** (strict sur auth/payments, souple sur feed/streaming).

---

### 14. Qualité · `console.log/warn` en production

On compte ~20 `console.log` dispersés dans le code backend. En production, ceux-ci ne sont pas structurés, ignorent les niveaux de log Pino, et exposent potentiellement des données sensibles.

**Remplacement** : Utiliser `fastify.log.info/warn/error` ou injecter `pino` directement dans les services.

---

### 15. Qualité · `data: any` dans les services Auth

**Fichier** : [`services/auth.service.ts:78`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/auth.service.ts#L78-L117)

```typescript
static async localRegister(data: any) { ... }
static async localLogin(data: any) { ... }
```
Typer correctement avec les schemas Zod inférés : `z.infer<typeof LocalRegisterSchema>`.

---

### 16. Qualité · `version` obsolète dans docker-compose

**Fichier** : [`infra/docker-compose.yml`](file:///Users/paulkone/Desktop/app/app-kephale/infra/docker-compose.yml)

```
WARN: the attribute `version` is obsolete
```
Retirer le champ `version:` du `docker-compose.yml` (obsolète depuis Docker Compose v2).

---

### 17. Robustesse · Pas de validation du body sur `POST /lives/:id/gift`

**Fichier** : [`routes/lives.ts:247`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/lives.ts#L247)

```typescript
const { tokens, message } = request.body as { tokens: number; message?: string };
```
Pas de Zod ici. Un body malformé (tokens = string, tokens négatif) peut passer. Ajouter un schema Zod.

---

### 18. Robustesse · Socket.IO — Pas de limite de taille sur les messages chat

**Fichier** : [`socket/index.ts:84`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/socket/index.ts#L84)

```typescript
message: message.trim().slice(0, 200), // Tronqué en output, mais pas validé en input
```
La validation se fait après réception, mais Socket.IO peut recevoir des payloads énormes. Ajouter un `maxHttpBufferSize` sur l'instance Socket.IO et valider la taille en entrée.

---

### 19. Robustesse · Pas de retry/dead-letter sur BullMQ

**Fichier** : [`queues/index.ts`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/queues/index.ts)

Les jobs BullMQ sans configuration de retry → un job de transcodage qui échoue est perdu. Configurer `attempts`, `backoff` et une `dead letter queue` pour les jobs critiques.

```typescript
await mediaProcessingQueue.add('transcode-video', payload, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
});
```

---

### 20. Robustesse · Pas de reset-password complet

**Fichier** : [`services/auth.service.ts:176-186`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/auth.service.ts#L176-L186)

```typescript
// [SIMULATION] Sending password reset email
```
Le mot de passe oublié retourne toujours `success: true` sans rien faire. Les utilisateurs qui oublient leur mot de passe sont bloqués définitivement.

---

### 21. Sécurité · Token LiveKit avec permissions trop larges

**Fichier** : [`routes/lives.ts:168`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/lives.ts#L168)

```typescript
at.addGrant({ roomJoin: true, room: live.roomId, canPublish: isHost, canSubscribe: true });
```
La condition `isHost` se base sur `user.artistProfile?.id` qui vient du JWT et non de la DB → un utilisateur pourrait manipuler son token. Toujours vérifier depuis la DB si l'utilisateur est bien l'artiste du live.

---

### 22. Mobile · Pas de gestion d'erreur réseau dans le player reels

**Fichier** : [`app/(tabs)/reels.tsx:29-32`](file:///Users/paulkone/Desktop/app/app-kephale/apps/mobile/app/%28tabs%29/reels.tsx#L29-L32)

Si la vidéo échoue à charger (réseau lent, URL expirée), il n'y a pas de fallback UI. L'utilisateur voit un écran noir. Ajouter un listener `statusChange` sur le player pour afficher une erreur ou re-tenter.

---

### 23. Mobile · `follow` sans feedback d'état local (optimistic update manquant)

**Fichier** : [`app/(tabs)/reels.tsx:125-130`](file:///Users/paulkone/Desktop/app/app-kephale/apps/mobile/app/%28tabs%29/reels.tsx#L125-L130)

```typescript
const handleFollow = () => {
  artistsAPI.follow(item.artist.id).catch(() => {}); // fire and forget
};
```
L'utilisateur clique "Suivre" mais le bouton ne change pas visuellement. Ajouter un état local ou un optimistic update via `queryClient`.

---

### 24. Mobile · `checkAuth` utilise `require()` dynamique

**Fichier** : [`stores/index.ts:52`](file:///Users/paulkone/Desktop/app/app-kephale/apps/mobile/src/stores/index.ts#L52)

```typescript
const { userAPI } = require('../lib/api'); // require() dans un store Zustand
```
Ce pattern est fragile avec le bundler Metro et peut causer des imports circulaires. Passer à un import statique ou injecter la fonction via un paramètre.

---

## 🟡 Améliorations — Pour la solidité long terme

### 25. Architecture · Extraire la logique de paiement dupliquée

La logique `buy-track`, `buy-album`, `buy-video` dans `payments.ts` répète le même pattern 3 fois (680 lignes). Créer un service `PurchaseService.initiatePurchase(type, itemId, userId, provider)`.

---

### 26. Architecture · Ajouter un `healthcheck` complet

**Fichier** : [`server.ts:144-148`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/server.ts#L144-L148)

```typescript
// Actuel : trop simple
fastify.get('/health', async () => ({ status: 'ok', timestamp: ... }));
```
Le health check devrait tester réellement les dépendances :
```typescript
{
  status: 'ok',
  dependencies: {
    database: await checkDB(),   // prisma.$queryRaw`SELECT 1`
    redis: await checkRedis(),   // redis.ping()
    s3: await checkS3(),
  }
}
```

---

### 27. Architecture · Ajouter des index DB sur les colonnes fréquemment filtrées

Vérifier le schéma Prisma pour des index manquants sur :
- `Video.status`, `Video.type`, `Video.artistId`, `Video.createdAt` (combiné)
- `Purchase.userId`, `Purchase.trackId`
- `UserVideoView.userId`, `UserVideoView.videoId`
- `UserArtistAffinity.userId`, `UserArtistAffinity.score`

---

### 28. Sécurité · Pas de Content-Security-Policy pour les SVG uploadés

Si un artiste peut uploader un fichier SVG dans le bucket S3, celui-ci peut contenir du JS malveillant. Whitelist les types MIME acceptés côté serveur lors du presigned-URL et côté S3 (bucket policy).

---

### 29. Sécurité · Refresh tokens non invalidés à la suppression de compte

**Fichier** : [`routes/users.ts`](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/users.ts)

Si un compte est supprimé, les refresh tokens actifs doivent être révoqués simultanément sinon l'ancien utilisateur peut continuer à obtenir de nouveaux access tokens.

---

### 30. DevOps · `version` obsolète dans docker-compose + MiniO non versionné

```yaml
# ❌ docker-compose.yml — retirer la ligne version:
version: '3.8'  # → à supprimer
```
Et épingler les versions des images Docker :
```yaml
postgres:16-alpine  # pas juste postgres:latest
redis:7-alpine
minio/minio:RELEASE.2024-01-01
```

---

### 31. DevOps · `.env` backend commité (présent dans le répertoire)

Le fichier `.env` (non seulement `.env.example`) est présent dans `apps/backend/`. S'assurer qu'il est **bien dans `.gitignore`** et ne jamais le commiter en Git.

---

### 32. Mobile · Pas de skeleton loader sur les screens principaux

Lors du chargement initial, les écrans affichent soit un spinner soit rien. Utiliser des `SkeletonLoader` (shimmer effect) pour une UX premium.

---

### 33. Mobile · Pas de gestion offline gracieuse

Si le réseau coupe, l'app affiche des erreurs brutes Axios. Implémenter :
- Détection réseau avec `@react-native-community/netinfo`
- Message "Pas de connexion" au lieu d'erreurs techniques
- Retry automatique quand le réseau revient

---

### 34. Qualité · Tests unitaires inexistants

Aucun fichier de test dans le projet. Pour une plateforme de paiement, c'est risqué. Priorités de tests :
1. `AuthService` (token generation, refresh rotation)
2. `AccessControlService` (logique d'accès payant)
3. `PaymentRoutes` (webhook handlers — données financières)

Recommandation : Vitest pour le backend, Jest + Testing Library pour le mobile.

---

### 35. Qualité · Absence de linting/formatting unifié

Pas de configuration ESLint/Prettier partagée au niveau racine du monorepo. Chaque package peut avoir des conventions différentes.

---

## 📋 Récapitulatif par Priorité

| Priorité | # | Domaine | Description |
|---|---|---|---|
| 🔴 Critique | 1 | Sécurité | `(request as any).user` → typer Fastify Request |
| 🔴 Critique | 2 | Sécurité | CORS Socket.IO `origin: '*'` |
| 🔴 Critique | 3 | Sécurité | Log mot de passe en clair |
| 🔴 Critique | 4 | Sécurité | Simulation achat tokens active en prod |
| 🔴 Critique | 5 | Sécurité | Webhook Stripe sans idempotence |
| 🔴 Critique | 6 | Qualité | `require()` dans ESM pour JWT |
| 🔴 Critique | 7 | Robustesse | viewerCount jamais décrémenté |
| 🔴 Critique | 8 | Robustesse | Double chemin don (REST + Socket) |
| 🟠 Important | 9–24 | Perf/Qualité | Voir détails ci-dessus |
| 🟡 Long terme | 25–35 | Architecture | Voir détails ci-dessus |

---

## 🎯 Plan d'action recommandé (Sprint immédiat)

**Semaine 1 — Sécurité bloquante** :
1. ✅ Supprimer le log de mot de passe (`auth.service.ts:131`)
2. ✅ Bloquer la simulation d'achat en prod (`payments.ts:119`)
3. ✅ Corriger l'idempotence Stripe (`payments.ts:685`)
4. ✅ Restreindre CORS Socket.IO
5. ✅ Typer `FastifyRequest.user`

**Semaine 2 — Robustesse** :
1. Implémenter le reset password complet (Resend)
2. Unifier les chemins de don (supprimer la route REST)
3. Gérer le viewerCount via Redis
4. Configurer retry BullMQ

**Semaine 3 — Performance** :
1. Migrer AsyncStorage → MMKV
2. Optimiser l'algo "For You" avec SQL natif
3. Rate limiting par route
4. Index Prisma manquants
