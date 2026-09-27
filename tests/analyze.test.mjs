import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { analyze, setupPassword, passwordHash, ownerResetPassword } from '../worker/index.js';

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
            sql, args,
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
function request(expiry, screenshot = image, mode = 'Fast') {
  return new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: screenshot, mode, expiry }),
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

test('visible chart with unreadable price and timeframe still produces a result', async () => {
  const { db, writes } = dbMock();
  const responseData = { ...analysis, pair: 'BTC/USDT', current_price: null, timeframe: null, sufficient_history: false };
  const result = await withFetch(async () => response('completed', responseData),
    () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account));
  assert.equal(result.result.pair, 'BTC/USDT');
  assert.equal(result.result.current_price, null);
  assert.equal(result.result.timeframe, null);
  assert.equal(writes.filter(write => write.sql === 'BATCH').length, 1);
});

test('TradingView-style compact crypto symbol is recognized', async () => {
  const { db } = dbMock();
  const result = await withFetch(async () => response('completed', { ...analysis, pair: 'BINANCE:BTCUSDT' }),
    () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account));
  assert.equal(result.result.pair, 'BTC/USDT');
});

test('PNG and WebP screenshots reach the vision API with their MIME types intact', async () => {
  const fixtures = [
    ['png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(2200)])],
    ['webp', Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.alloc(2200)])],
  ];
  for (const [format, bytes] of fixtures) {
    const screenshot = `data:image/${format};base64,${bytes.toString('base64')}`;
    const { db } = dbMock();
    let sentImage;
    await withFetch(async (_url, options) => {
      sentImage = JSON.parse(options.body).input[0].content[1].image_url;
      return response('completed', analysis);
    }, () => analyze(request(3, screenshot), { DB: db, OPENAI_API_KEY: 'test' }, account));
    assert.equal(sentImage, screenshot);
  }
});

test('all available AI modes complete and charge only on a saved result', async () => {
  for (const mode of ['Fast', 'Deep', 'Maximum']) {
    const { db, writes } = dbMock();
    let sent;
    const result = await withFetch(async (_url, options) => {
      sent = JSON.parse(options.body);
      return response('completed', analysis);
    }, () => analyze(request(3, image, mode), { DB: db, OPENAI_API_KEY: 'test' }, account));
    assert.equal(result.mode, mode);
    assert.equal(sent.input[0].content[1].image_url, image);
    assert.equal(writes.filter(write => write.sql === 'BATCH').length, 1);
  }
});

test('large PNG and JPEG payloads fit the request limit and reach the model', async () => {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(4_100_000)]);
  const jpeg = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(4_100_000)]);
  for (const [format, bytes] of [['png', png], ['jpeg', jpeg]]) {
    const { db } = dbMock();
    const dataUrl = `data:image/${format};base64,${bytes.toString('base64')}`;
    let sent;
    await withFetch(async (_url, options) => {
      sent = JSON.parse(options.body).input[0].content[1].image_url;
      return response('completed', analysis);
    }, () => analyze(request(3, dataUrl), { DB: db, OPENAI_API_KEY: 'test' }, account));
    assert.equal(sent, dataUrl);
  }
});

test('invalid MIME, excess payload and locked mode fail before reservation and credits', async () => {
  const { db, writes } = dbMock();
  const env = { DB: db, OPENAI_API_KEY: 'test' };
  const heic = 'data:image/heic;base64,' + Buffer.alloc(2200).toString('base64');
  await assert.rejects(analyze(request(3, heic), env, account), error => error.code === 'INVALID_IMAGE');
  const locked = { ...account, tier: 'BASE' };
  await assert.rejects(analyze(request(3, image, 'Maximum'), env, locked), error => error.code === 'MODE_LOCKED');
  const tooLarge = new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '16100001' },
    body: JSON.stringify({ image, mode: 'Fast', expiry: 3 }),
  });
  await assert.rejects(analyze(tooLarge, env, account), error => error.code === 'TOO_LARGE');
  assert.equal(writes.length, 0);
});

test('AI API failure allows a retry without a charge on the first attempt', async () => {
  const { db, writes } = dbMock();
  await assert.rejects(withFetch(async () => Response.json({ error: { code: 'invalid_image' } }, { status: 400 }),
    () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account)), error => error.code === 'AI_UNAVAILABLE');
  const result = await withFetch(async () => response('completed', analysis),
    () => analyze(request(3), { DB: db, OPENAI_API_KEY: 'test' }, account));
  assert.equal(result.result.verdict, 'UP');
  assert.equal(writes.filter(write => write.sql === 'BATCH').length, 1);
  assert.equal(writes.filter(write => write.sql.startsWith('DELETE FROM analyses')).length, 1);
});

test('owner reset stores a hash, requires password change and revokes sessions', async () => {
  const { db, writes } = dbMock();
  const temporaryPassword = 'TemporaryPassword-2026';
  const resetRequest = new Request('https://worker.example/api/admin/users/12345/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ temporaryPassword }),
  });
  const result = await ownerResetPassword(resetRequest, { DB: db }, '12345');
  assert.equal(result.mustChangePassword, true);
  const update = writes.find(write => write.sql.startsWith('UPDATE accounts SET password_hash'));
  assert.ok(update);
  assert.notEqual(update.args[0], temporaryPassword);
  assert.equal(update.args[3], '12345');
  assert.ok(writes.some(write => write.sql === 'DELETE FROM sessions WHERE account_id = ?'));
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

test('deep links serve the app shell without redirecting or changing the address', async () => {
  const served = [];
  const env = { ASSETS: { fetch(request) { served.push(new URL(request.url).pathname); return new Response('app'); } } };
  for (const path of ['/login/', '/history/', '/history/123e4567-e89b-12d3-a456-426614174000/', '/level/', '/settings/']) {
    const response = await worker.fetch(new Request(`https://bluefinplus.site${path}`), env);
    assert.equal(await response.text(), 'app');
  }
  assert.deepEqual(served, Array(5).fill('/index.html'));
});

test('legacy bearer session moves to HttpOnly cookie and logout clears it', async () => {
  const token = 'a'.repeat(64);
  const queries = [];
  const env = { DB: { prepare(sql) { queries.push(sql); return { bind() { return {
    first: async () => account,
    run: async () => ({ meta: { changes: 1 } }),
  }; } }; } } };
  const migrated = await worker.fetch(new Request('https://bluefinplus.site/api/auth/session', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://bluefinplus.site' },
  }), env);
  assert.equal(migrated.status, 200);
  assert.equal((await migrated.json()).token, undefined);
  assert.match(migrated.headers.get('Set-Cookie'), /^blufin_session=aaaa.*HttpOnly; Secure; SameSite=Lax/);
  const current = await worker.fetch(new Request('https://bluefinplus.site/api/me', {
    headers: { Cookie: `blufin_session=${token}` },
  }), env);
  assert.equal((await current.json()).status, 'active');
  const logout = await worker.fetch(new Request('https://bluefinplus.site/api/auth/logout', {
    method: 'POST', headers: { Cookie: `blufin_session=${token}` },
  }), env);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.ok(queries.some(sql => sql.startsWith('DELETE FROM sessions')));
});

test('history is scoped, filtered and paged, with a direct detail route', async () => {
  const token = 'b'.repeat(64);
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const rows = Array.from({ length: 13 }, (_, index) => ({
    id: index ? `123e4567-e89b-12d3-a456-${String(index).padStart(12, '0')}` : id,
    asset: 'EUR/USD', mode: 'Fast', created_at: Date.now(), signal_expires_at: null,
    signal_duration_seconds: 180, result_json: JSON.stringify({ verdict: 'UP', pair: 'EUR/USD', image_preview: image }),
  }));
  const statements = [];
  const env = { DB: { prepare(sql) { return { bind(...args) { statements.push({ sql, args }); return {
    first: async () => sql.includes('FROM sessions') ? account : rows[0],
    all: async () => ({ results: rows }),
  }; } }; } } };
  const list = await worker.fetch(new Request('https://bluefinplus.site/api/history?page=2&mode=Fast&direction=UP&q=EUR', {
    headers: { Cookie: `blufin_session=${token}` },
  }), env);
  const data = await list.json();
  assert.equal(data.analyses.length, 12);
  assert.equal(data.hasMore, true);
  assert.equal(data.analyses[0].preview, null);
  assert.equal(data.analyses[0].result.image_preview, undefined);
  assert.deepEqual(statements.at(-1).args, [account.account_id, 'Fast', 'UP', '%EUR%', 24]);
  const detail = await worker.fetch(new Request(`https://bluefinplus.site/api/history/${id}`, {
    headers: { Cookie: `blufin_session=${token}` },
  }), env);
  const detailData = await detail.json();
  assert.equal(detailData.analysis.id, id);
  assert.equal(detailData.analysis.preview, image);
  assert.deepEqual(statements.at(-1).args, [account.account_id, id]);
});

test('a successful analysis stores only its small preview alongside the result', async () => {
  const { db, writes } = dbMock();
  const req = new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, preview: image, mode: 'Fast', expiry: 3 }),
  });
  const result = await withFetch(async () => response('completed', analysis),
    () => analyze(req, { DB: db, OPENAI_API_KEY: 'test' }, account));
  assert.equal(result.preview, image);
  const saved = writes.find(write => write.sql === 'BATCH').statements[1];
  assert.equal(JSON.parse(saved.args[1]).image_preview, image);
  assert.doesNotMatch(saved.sql, /image_preview\s*=/);
});
