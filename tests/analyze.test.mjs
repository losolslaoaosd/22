import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../worker/index.js';

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
