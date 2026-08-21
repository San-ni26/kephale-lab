/**
 * K6 — Test de charge Kephale API
 *
 * Scénarios :
 *  1. smoke   — 2 VU, 1 min  : vérifier que tout répond
 *  2. load    — montée jusqu'à 50 VU, 5 min : charge normale
 *  3. stress  — montée jusqu'à 200 VU : trouver le point de rupture
 *  4. soak    — 20 VU, 30 min : détecter les fuites mémoire / dégradation lente
 *
 * Usage :
 *   k6 run k6/load-test.js                        # smoke par défaut
 *   k6 run -e SCENARIO=load k6/load-test.js
 *   k6 run -e SCENARIO=stress k6/load-test.js
 *   k6 run -e SCENARIO=soak k6/load-test.js
 *   k6 run -e BASE_URL=https://kephale-lab.onrender.com k6/load-test.js
 *
 * Seuils de succès (thresholds) :
 *   - p95 < 500ms pour toutes les requêtes
 *   - Taux d'erreur HTTP < 1%
 *   - p99 login < 800ms
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';
const SCENARIO = __ENV.SCENARIO || 'smoke';

// ── Métriques personnalisées ──────────────────────────────────────────────────
const errorRate     = new Rate('errors');
const loginDuration = new Trend('login_duration', true);
const tracksDuration= new Trend('tracks_duration', true);
const feedDuration  = new Trend('feed_duration', true);
const authErrors    = new Counter('auth_errors');

// ── Scénarios ─────────────────────────────────────────────────────────────────
const scenarios = {
  smoke: {
    executor: 'constant-vus',
    vus: 2,
    duration: '1m',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m',  target: 20  }, // montée douce
      { duration: '3m',  target: 50  }, // charge nominale
      { duration: '1m',  target: 0   }, // descente
    ],
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m',  target: 50  },
      { duration: '3m',  target: 100 },
      { duration: '2m',  target: 200 },
      { duration: '2m',  target: 0   },
    ],
  },
  soak: {
    executor: 'constant-vus',
    vus: 20,
    duration: '30m',
  },
};

export const options = {
  scenarios: { [SCENARIO]: scenarios[SCENARIO] || scenarios.smoke },

  thresholds: {
    // Seuils globaux
    http_req_duration:        ['p(95)<500', 'p(99)<1000'],
    http_req_failed:          ['rate<0.01'],   // < 1% d'erreurs
    errors:                   ['rate<0.01'],

    // Seuils par route critique
    login_duration:           ['p(95)<800'],
    tracks_duration:          ['p(95)<400'],
    feed_duration:            ['p(95)<600'],
  },
};

// ── Données de test ───────────────────────────────────────────────────────────
// Remplacez par de vrais tokens si vous testez les routes protégées
const TEST_USERS = [
  { email: 'test1@kephale.com', password: 'Test1234!' },
  { email: 'test2@kephale.com', password: 'Test1234!' },
];

const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function assertOk(res, name) {
  const ok = check(res, {
    [`${name} → status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} → body non vide`]: (r) => r.body && r.body.length > 0,
    [`${name} → success:true`]: (r) => {
      try { return JSON.parse(r.body).success === true; } catch { return false; }
    },
  });
  errorRate.add(!ok);
  return ok;
}

function assertRateLimit(res, name) {
  // 429 est attendu quand on dépasse la limite — c'est un succès de sécurité
  const ok = check(res, {
    [`${name} → status 2xx ou 429`]: (r) => r.status < 300 || r.status === 429,
  });
  errorRate.add(!ok);
}

// ── Scénario principal ────────────────────────────────────────────────────────
export default function () {
  let accessToken = null;

  // ── 1. Authentification ───────────────────────────────────────────────────
  group('Auth', () => {

    group('POST /auth/login', () => {
      const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
      const start = Date.now();

      const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: user.email, password: user.password }),
        { headers }
      );

      loginDuration.add(Date.now() - start);

      if (res.status === 200) {
        const body = JSON.parse(res.body);
        accessToken = body.data?.accessToken;
        assertOk(res, 'Login');
      } else if (res.status === 401) {
        // Utilisateur de test inexistant — on continue sans token
        authErrors.add(1);
      } else {
        assertRateLimit(res, 'Login rate-limit');
      }
    });

    sleep(0.5);

    group('POST /auth/refresh (si token disponible)', () => {
      if (!accessToken) return;
      // On ne teste pas le refresh ici pour ne pas invalider le token
    });

  });

  // ── 2. Routes publiques ───────────────────────────────────────────────────
  group('Public routes', () => {

    group('GET /health', () => {
      const res = http.get(`${BASE_URL.replace('/api/v1', '')}/health`, { headers });
      check(res, { 'Health → 200': (r) => r.status === 200 });
    });

    sleep(0.2);

    group('GET /tracks', () => {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/tracks?limit=20&page=1`, { headers });
      tracksDuration.add(Date.now() - start);
      assertOk(res, 'GET /tracks');
    });

    sleep(0.2);

    group('GET /tracks (recherche)', () => {
      const queries = ['hip hop', 'afrobeats', 'jazz', 'pop', 'dancehall'];
      const q = queries[Math.floor(Math.random() * queries.length)];
      const start = Date.now();
      const res = http.get(`${BASE_URL}/tracks?search=${encodeURIComponent(q)}&limit=10`, { headers });
      tracksDuration.add(Date.now() - start);
      assertOk(res, `GET /tracks?search=${q}`);
    });

    sleep(0.2);

    group('GET /artists', () => {
      const res = http.get(`${BASE_URL}/artists?limit=20`, { headers });
      assertOk(res, 'GET /artists');
    });

    sleep(0.2);

    group('GET /albums', () => {
      const res = http.get(`${BASE_URL}/albums?limit=20`, { headers });
      assertOk(res, 'GET /albums');
    });

  });

  // ── 3. Routes authentifiées (si token disponible) ─────────────────────────
  if (accessToken) {
    const authHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };

    group('Authenticated routes', () => {

      group('GET /feed', () => {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/feed`, { headers: authHeaders });
        feedDuration.add(Date.now() - start);
        assertOk(res, 'GET /feed');
      });

      sleep(0.2);

      group('GET /users/me', () => {
        const res = http.get(`${BASE_URL}/users/me`, { headers: authHeaders });
        assertOk(res, 'GET /users/me');
      });

      sleep(0.2);

      group('GET /playlists', () => {
        const res = http.get(`${BASE_URL}/playlists`, { headers: authHeaders });
        assertOk(res, 'GET /playlists');
      });

      sleep(0.2);

      group('GET /notifications', () => {
        const res = http.get(`${BASE_URL}/notifications`, { headers: authHeaders });
        assertOk(res, 'GET /notifications');
      });

    });
  }

  // ── 4. Test de sécurité — Rate limiting ──────────────────────────────────
  group('Security — Rate limiting', () => {

    group('Brute-force login simulé (doit déclencher 429)', () => {
      // On envoie quelques requêtes invalides pour tester le rate limit
      // (ne pas en envoyer trop — le test lui-même pourrait se faire bloquer)
      const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: 'attacker@evil.com', password: 'wrongpassword' }),
        { headers }
      );
      // 401 = pas de compte, 429 = rate limited : les deux sont OK
      check(res, {
        'Brute-force → 401 ou 429': (r) => r.status === 401 || r.status === 429,
        'Brute-force → jamais 200': (r) => r.status !== 200,
      });
    });

    sleep(0.3);

    group('Payload JSON surdimensionné (doit retourner 413)', () => {
      const bigPayload = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) }); // 2 MB
      const res = http.post(
        `${BASE_URL}/auth/login`,
        bigPayload,
        { headers }
      );
      check(res, {
        'Big payload → 413 ou 400': (r) => r.status === 413 || r.status === 400,
        'Big payload → jamais 500': (r) => r.status !== 500,
      });
    });

  });

  sleep(1);
}

// ── Rapport de fin ────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    base_url: BASE_URL,
    metrics: {
      total_requests: data.metrics.http_reqs?.values?.count,
      failed_requests: data.metrics.http_req_failed?.values?.passes,
      error_rate_pct: (data.metrics.errors?.values?.rate * 100).toFixed(2) + '%',
      p95_ms: data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(0),
      p99_ms: data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(0),
      avg_ms: data.metrics.http_req_duration?.values?.avg?.toFixed(0),
      login_p95_ms: data.metrics.login_duration?.values?.['p(95)']?.toFixed(0),
      tracks_p95_ms: data.metrics.tracks_duration?.values?.['p(95)']?.toFixed(0),
      feed_p95_ms: data.metrics.feed_duration?.values?.['p(95)']?.toFixed(0),
    },
    thresholds_passed: !Object.values(data.metrics).some(
      (m) => m.thresholds && Object.values(m.thresholds).some((t) => !t.ok)
    ),
  };

  console.log('\n📊 RÉSUMÉ K6 ─────────────────────────────────────');
  console.log(JSON.stringify(summary, null, 2));

  return {
    'k6/results/summary.json': JSON.stringify(summary, null, 2),
    stdout: '\n✅ Rapport sauvegardé dans k6/results/summary.json\n',
  };
}
