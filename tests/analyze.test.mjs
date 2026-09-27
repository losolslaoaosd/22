import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { analyze, setupPassword, passwordHash } from '../worker/index.js';

const account = {
  account_id: '12345', activated_at: Date.now(), tier: 'PRO', role: 'user',
  password_hash: 'configured', signals_used_in_cycle: 0, credits_spent_in_cycle: 0,
  limit_cycle_reset_at: null,
};
const image = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(2200)]).toString('base64');
const analysis = {
  pair: 'EUR/USD', current_price: '1.2345', timeframe: 'M1',
  chart_visible: true, recent_candles_visible: true, sufficient_history: true, verdict: 'UP',
  ...Object.fromEntries(['trend', 'structure', 'momentum', 'volatility', 'historical_match', 'ai_consensus',
    'key_levels', 'setup', 'reason', 'invalidation', 'limitations', 'final_conclusion'].map(field => [field, 'Видимые признаки.'])),
};
function dbMock() {
  const writes = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            run: async () => { writes.push({ sql, args }); return { meta: { changes: 1 } }; },
            first: async () => account,
          };
        },
      };
    },
    batch: async statements => {
      writes.push({ sql: 'BATCH', statements });
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
    },
  };
  return { db, writes };
}
function request(expiry) {
  return new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mode: 'Fast', expiry }),
  });
}
function response(status, result, extra = {}) {
  return Response.json({ status, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }], ...extra });
}
async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

for (const expiry of [1, 3, 5, 15]) {
  test(`expiry ${expiry} reaches OpenAI, saved result and timer`, async () => {
    const { db, writes } = dbMock();
    let prompt;
    const result = await withFetch(async (_url, options) => {
      prompt = JSON.parse(options.body);
      return response('completed', analysis);
    }, () => analyze(request(expiry), { DB: db, OPENAI_API_KEY: 'test' }, account));
    assert.match(prompt.instructions, new RegExp(`экспирация: ${expiry} мин`));
    assert.deepEqual(prompt.text.format.schema.properties.verdict.enum, ['UP', 'DOWN']);
    assert.equal(result.signalDuration, expiry * 60);
    assert.equal(result.signalExpiresAt - result.signalCreatedAt, expiry * 60_000);
    assert.equal(result.result.signal_duration_minutes, expiry);
    assert.equal(writes[0].args[1], expiry);
    assert.equal(writes.filter(write => write.sql === 'BATCH').length, 1);
  });
}

test('incomplete response is retried, without double charge', async () => {
  const { db, writes } = dbMock();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return calls === 1
      ? response('incomplete', analysis, { incomplete_details: { reason: 'max_output_tokens' } })
      : response('completed', analysis);
  }, () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account));
  assert.equal(calls, 2);
  assert.equal(writes.filter(write => write.sql === 'BATCH').length, 1);
});

test('failed model response releases reservation and does not charge', async () => {
  const { db, writes } = dbMock();
  await assert.rejects(
    withFetch(async () => response('incomplete', analysis, { incomplete_details: { reason: 'max_output_tokens' } }),
      () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account)),
    error => error.code === 'AI_UNAVAILABLE',
  );
  assert.equal(writes.filter(write => write.sql === 'BATCH').length, 0);
  assert.equal(writes.filter(write => write.sql.startsWith('DELETE FROM analyses')).length, 1);
});

test('unreadable chart does not charge and invalid expiry is rejected before reservation', async () => {
  const { db, writes } = dbMock();
  await assert.rejects(
    withFetch(async () => response('completed', { ...analysis, pair: null }),
      () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account)),
    error => error.code === 'SCREENSHOT_INCOMPLETE',
  );
  assert.equal(writes.filter(write => write.sql === 'BATCH').length, 0);
  assert.equal(writes.filter(write => write.sql.startsWith('DELETE FROM analyses')).length, 1);
  await assert.rejects(analyze(request(2), { DB: db, OPENAI_API_KEY: 'test' }, account), error => error.code === 'INVALID_EXPIRY');
  assert.equal(writes.length, 2);
});

test('every public entry page exposes the same expiry and level controls', () => {
  for (const page of ['index.html', 'app/index.html', 'account/index.html', 'owner/index.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /id="expiry-options"/);
    assert.match(html, /id="level-dialog"/);
    for (const expiry of [1, 3, 5, 15]) assert.match(html, new RegExp(`data-expiry="${expiry}"`));
    assert.doesNotMatch(html, /NO_TRADE|ПРОПУСТИТЬ|УЖЕ ЗАРЕГИСТРИРОВАНЫ/);
  }
});

test('password setup updates account and replaces session in one D1 transaction', async () => {
  const verified = { ...account, verified_at: Date.now(), password_hash: null, session_version: 1 };
  let statements;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args, first: async () => verified };
        },
      };
    },
    async batch(items) {
      statements = items;
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }];
    },
  };
  const result = await setupPassword(new Request('https://worker.example/api/auth/setup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'a'.repeat(64)}` },
    body: JSON.stringify({ password: 'long-test-password-123' }),
  }), { DB: db });
  assert.match(result.token, /^[0-9a-f]{64}$/);
  assert.equal(result.passwordConfigured, true);
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /UPDATE accounts SET password_hash/);
  assert.equal(statements[0].args[2], 400_000);
  assert.match(statements[0].args[0], /^v2\$[0-9a-f]{64}$/);
  assert.match(statements[1].sql, /INSERT INTO sessions/);
  assert.match(statements[2].sql, /DELETE FROM sessions.*token_hash !=/s);
  assert.equal(statements[1].args[3], verified.account_id);
});

test('password hashing is stable across 400,000 chained iterations', async () => {
  const salt = '0123456789abcdef0123456789abcdef';
  const hash = await passwordHash('long-test-password-123', salt);
  assert.match(hash, /^v2\$[0-9a-f]{64}$/);
  assert.equal(await passwordHash('long-test-password-123', salt), hash);
  assert.notEqual(await passwordHash('other-test-password-123', salt), hash);
  assert.match(await passwordHash('legacy-password', salt, 100_000), /^[0-9a-f]{64}$/);
});

test('password setup does not return a token when the transaction fails', async () => {
  const verified = { ...account, verified_at: Date.now(), password_hash: null, session_version: 1 };
  const db = {
    prepare(sql) {
      return { bind(...args) { return { sql, args, first: async () => verified }; } };
    },
    async batch() { throw new Error('database unavailable'); },
  };
  await assert.rejects(setupPassword(new Request('https://worker.example/api/auth/setup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'a'.repeat(64)}` },
    body: JSON.stringify({ password: 'long-test-password-123' }),
  }), { DB: db }), error => error.code === 'PASSWORD_SETUP_FAILED');
});

test('login initializes the rate-limit table before querying it', async () => {
  const queries = [];
  const db = {
    prepare(sql) {
      return { async run() { queries.push(sql); }, bind() { return {
        async first() { queries.push(sql); return { total: 0 }; },
      }; } };
    },
    async batch() { return []; },
  };
  const response = await worker.fetch(new Request('https://worker.example/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: '0', password: 'not-a-real-password' }),
  }), { DB: db, POSTBACK_SECRET: 'test' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_LOGIN');
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS login_attempts/);
  assert.match(queries[1], /CREATE INDEX IF NOT EXISTS login_attempts_key_created/);
  assert.match(queries[2], /SELECT COUNT\(\*\) AS total FROM login_attempts/);
});

test('custom domain serves site assets and accepts its API origin', async () => {
  const served = [];
  const env = {
    SITE_ORIGIN: 'https://losolslaoaosd.github.io',
    DB: {},
    ASSETS: { fetch(request) { served.push(new URL(request.url).pathname); return new Response('site'); } },
  };
  const site = await worker.fetch(new Request('https://bluefinplus.site/app/'), env);
  assert.equal(await site.text(), 'site');
  assert.deepEqual(served, ['/app/']);
  const config = await worker.fetch(new Request('https://bluefinplus.site/api/config', {
    headers: { Origin: 'https://bluefinplus.site' },
  }), env);
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('Access-Control-Allow-Origin'), 'https://bluefinplus.site');
  const oldOrigin = await worker.fetch(new Request('https://worker.example/api/config', {
    headers: { Origin: 'https://losolslaoaosd.github.io' },
  }), env);
  assert.equal(oldOrigin.status, 200);
});
