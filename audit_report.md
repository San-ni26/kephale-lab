# Rapport d'Audit : Sponsorisation, Publicité & Gestion des Jetons

## ✅ Ce qui est correctement configuré

### 🎯 Système de Sponsorisation Créateur (Self-Serve Boost)
| Composant | Statut | Détail |
|---|---|---|
| `AdsService.createSelfServeBoost()` | ✅ Opérationnel | Débit atomique de jetons + création campagne en 1 transaction |
| Packs prédéfinis (DISCOVERY, TRENDING, VIRAL, CUSTOM) | ✅ OK | 50 / 200 / 700 Jetons, impressions garanties |
| Vérification propriété du contenu | ✅ OK | Vérifie que l'user est bien l'auteur du Reel/Track/Album/Clip |
| Déduction atomique jetons (`$transaction`) | ✅ OK | Anti-double-débit sécurisé |
| Types supportés | ✅ OK | REEL, CLIP, TRACK, ALBUM |
| Cible géographique (`targetCountries`) | ✅ OK | Filtrage par pays |

### 📊 Tableau de Bord Analytique Créateur
| Composant | Statut | Détail |
|---|---|---|
| `GET /ads/my-campaigns` | ✅ OK | Liste des campagnes propres à l'user |
| `GET /ads/my-analytics/:id` | ✅ OK | Rapport détaillé (CTR, taux complétion, pays, devices) |
| `apps/mobile/app/sponsor/[id].tsx` | ✅ OK | Écran d'analytics campagne dans le mobile |
| Rapport partageable (Share) | ✅ OK | Export texte certifié des KPIs |

### 🏛️ Régie Admin (Annonceurs Externes)
| Composant | Statut | Détail |
|---|---|---|
| `AdminAdsController` | ✅ OK | CRUD Annonceurs, Campagnes, Stats globales |
| Guard ADMIN (`@Roles('ADMIN')`) | ✅ OK | Routes protégées uniquement pour ADMIN |
| `apps/mobile/app/admin/ads.tsx` | ✅ OK | Interface admin de gestion des publicités |
| `getGlobalAdStats()` | ✅ OK | KPIs globaux (total campagnes, impressions, CTR moyen) |

### 🪙 Moteur de Jetons (Tokens)
| Composant | Statut | Détail |
|---|---|---|
| Parité officielle : **1 Jeton = 10 FCFA** | ✅ OK | Ancré dans `CurrencyService` |
| `CurrencyService.calculateTokensForFiat()` | ✅ OK | Arrondi `Math.ceil` anti-perte |
| `CurrencyService.calculateArtistSplit()` | ✅ OK | Répartition 80/20 sans monnaie fantôme |
| `PaymentsService.buyTokens()` | ✅ OK | Multi-devises avec conversion robuste |
| `PaymentsService.payWithTokens()` | ✅ OK | Débit atomique avec vérification solde |
| `buy-tokens.tsx` (mobile) | ✅ OK | Sélecteur 13 devises + parité affichée |
| `PaymentMethodModal.tsx` | ✅ OK | Calcul `calculateTokensForPrice` unifié |

### 🗃️ Base de Données (Prisma Schema)
| Modèle | Statut |
|---|---|
| `User.tokenBalance` | ✅ Présent |
| `TokenPack` | ✅ Présent |
| `AdCampaign` (avec `costTokens`, `boostPackage`) | ✅ Présent |
| `AdImpression` (avec `watched100`) | ✅ Présent |
| `AdClick` | ✅ Présent |
| `Advertiser` | ✅ Présent |
| Enum `AdPlacement` (REEL, CLIP_PREROLL, BANNER, AUDIO_SPOT, TRACK_BOOST, ALBUM_BOOST) | ✅ Présent |
| Enum `AdStatus` (DRAFT, ACTIVE, PAUSED, COMPLETED) | ✅ Présent |

---

## ⚠️ Points à corriger / améliorer

### 1. Bug d'identifiant user dans `ads.controller.ts`
Le `AuthGuard` stocke `req.user.userId` (non `req.user.id`). Or `ads.controller.ts` utilise `req.user.id`, ce qui retournera `undefined` → toutes les campagnes self-serve seront liées à `userId = undefined`.

```typescript
// ❌ ACTUELLEMENT (ads.controller.ts lignes 81, 101, 113)
const userId = req.user.id;       // undefined !

// ✅ CORRECTION REQUISE
const userId = req.user!.userId;  // correct
```

### 2. Pas de `TokenTransaction` enregistrée en base
Quand un user achète des jetons ou les dépense en boost, il n'y a pas de log transactionnel (historique des débits/crédits de jetons) dans la DB. Si un litige survient, il est impossible de prouver le débit.

> **Recommandation** : Ajouter un modèle `TokenTransaction { userId, amount, type, description, campaignId?, createdAt }` et le peupler dans chaque débit/crédit.

### 3. Pas de plafond anti-fraude sur `recordImpression`
L'endpoint `POST /ads/:id/impression` n'est pas authentifié : n'importe qui peut appeler cet endpoint en boucle pour gonfler artificiellement les compteurs d'une campagne.

> **Recommandation** : Ajouter un guard optionnel ou une déduplication par `(campaignId + userId + date)`.

### 4. `TokenPack.priceEur` est stocké en `Int` dans le schéma
Les prix en euros sont des décimaux (ex: 2.99 €). Stocker en `Int` force un arrondi (soit 2 soit 3 €), ce qui génère des conversions incorrectes.

> **Recommandation** : Migrer `priceEur` de `Int` → `Float` dans le schéma Prisma.

---

## 🛠️ Actions Recommandées (par priorité)
1. 🔴 **[Critique]** Corriger `req.user.id` → `req.user!.userId` dans `ads.controller.ts`
2. 🟠 **[Important]** Migrer `TokenPack.priceEur` de `Int` → `Float` + migration DB
3. 🟡 **[Recommandé]** Ajouter modèle `TokenTransaction` pour l'historique
4. 🟡 **[Recommandé]** Protéger `POST /ads/:id/impression` contre l'inflation artificielle
