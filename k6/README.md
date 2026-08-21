# K6 — Tests de Charge Kephale API

## Installation

```bash
brew install k6
```

## Lancer un test

```bash
# Smoke test (2 VU, 1 min) — vérification rapide
bash k6/run-k6.sh

# Load test (50 VU, 5 min) — charge normale
bash k6/run-k6.sh load

# Stress test (200 VU) — trouver le point de rupture
bash k6/run-k6.sh stress

# Soak test (20 VU, 30 min) — détecter les fuites mémoire
bash k6/run-k6.sh soak

# Test sur la production
bash k6/run-k6.sh smoke prod
bash k6/run-k6.sh load prod
```

## Scénarios

| Scénario | VU max | Durée | Objectif |
|----------|--------|-------|----------|
| `smoke`  | 2      | 1 min | Tout fonctionne |
| `load`   | 50     | 5 min | Charge normale |
| `stress` | 200    | 9 min | Point de rupture |
| `soak`   | 20     | 30 min | Fuites mémoire |

## Seuils de succès (thresholds)

| Métrique | Seuil |
|----------|-------|
| p95 global | < 500ms |
| p99 global | < 1000ms |
| Taux d'erreur | < 1% |
| Login p95 | < 800ms |
| Tracks p95 | < 400ms |
| Feed p95 | < 600ms |

## Routes testées

- `GET /health` — santé du serveur
- `POST /auth/login` — authentification
- `GET /tracks` — liste des pistes
- `GET /tracks?search=...` — recherche
- `GET /artists` — liste des artistes
- `GET /albums` — liste des albums
- `GET /feed` — fil d'actualité (auth)
- `GET /users/me` — profil (auth)
- `GET /playlists` — playlists (auth)
- Test rate limiting (brute-force simulé)
- Test body size limit (payload 2MB)

## Résultats

Les résultats sont sauvegardés dans `k6/results/<timestamp>-<scenario>/` :
- `raw.json` — métriques brutes
- `summary.json` — résumé

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `BASE_URL` | `http://localhost:4000/api/v1` | URL de l'API |
| `SCENARIO` | `smoke` | Scénario à exécuter |
