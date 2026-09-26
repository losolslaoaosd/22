import { LEVELS, AI_MODES, levelFor, levelNamed } from './levels.js';

const ASSETS = ['EUR/USD', 'GBP/USD', 'USD/CAD', 'USD/JPY', 'GBP/AUD', 'GBP/JPY', 'EUR/CAD', 'EUR/JPY', 'USD/CHF', 'AUD/USD', 'GBP/CAD', 'NZD/USD'];
const EXPIRIES = [1, 3, 5, 15];
const PARTNER_BASE = 'https://api.binopartner.com/v1/partner-api';
const DAY = 86_400_000;
const OWNER_ACCOUNT = '__blufin_owner__';
const UNLIMITED_ACCOUNT = '99105';
const ACCOUNT_FIELDS = 'account_id, registered_at, verified_at, activated_at, qualified_deposit_cents, tier, limit_cycle_started_at, limit_cycle_reset_at, signals_used_in_cycle, credits_spent_in_cycle, role, password_hash, password_salt, password_iterations, must_change_password, session_version';
const PASSWORD_ITERATIONS = 310_000;
const OWNER_CODE_PATTERN = /^(?:[0-9a-f]{64}|[0-9]{10,16})$/;

function cors(origin, env) {
  return origin && origin === env.SITE_ORIGIN ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } : {};
}
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function error(status, code, message, headers) { return json({ code, message }, status, headers); }
function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function id(value) { return typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)); }
function eventId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value); }
function secretEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function bearer(request) { return request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || ''; }
function hex(bytes) { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(salt.match(/../g).map(byte => parseInt(byte, 16))), iterations }, key, 256);
  return hex(new Uint8Array(bits));
}
function validPassword(password) { return typeof password === 'string' && password.length >= 10 && password.length <= 128 && new TextEncoder().encode(password).byteLength <= 256; }
async function issueSession(env, account, remember = false) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, expires_at, auth_version, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), account.account_id, now + (remember ? 30 : 7) * DAY, account.session_version || 0, now).run();
  return token;
}
async function ownerSignature(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`BLUFIN_OWNER_V1:${value}`))));
}
async function readJson(request, maximum = 5_000_000) {
  if (Number(request.headers.get('Content-Length')) > maximum) throw httpError(413, 'TOO_LARGE', 'Слишком большой запрос');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximum) throw httpError(413, 'TOO_LARGE', 'Слишком большой запрос');
  try { return JSON.parse(text); } catch { throw httpError(400, 'INVALID_JSON', 'Некорректный JSON'); }
}

async function trader(env, accountId) {
  if (!env.PARTNER_API_KEY) throw httpError(503, 'PARTNER_NOT_CONFIGURED', 'Проверка ID ещё не подключена');
  const response = await fetch(`${PARTNER_BASE}/stats/trader/${accountId}`, {
    headers: { Authorization: `Bearer ${env.PARTNER_API_KEY}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) {
    const details = await response.json().catch(() => null);
    if (details?.reason === 'USER_NOT_FOUND') return null;
    throw httpError(502, 'PARTNER_UNAVAILABLE', 'Проверка ID сейчас недоступна. Повторите позже.');
  }
  if (response.status === 401 || response.status === 429) throw httpError(503, 'PARTNER_UNAVAILABLE', 'Проверка ID сейчас недоступна. Повторите позже.');
  if (!response.ok) throw httpError(502, 'PARTNER_UNAVAILABLE', 'Проверка ID сейчас недоступна. Повторите позже.');
  const result = await response.json();
  if (result.code !== 200 || !result.data || Number(result.data.uid) !== Number(accountId)) {
    throw httpError(502, 'PARTNER_INVALID_RESPONSE', 'Получен некорректный ответ проверки ID');
  }
  return result.data;
}

async function currentAccount(request, env) {
  const token = bearer(request);
  if (env.ADMIN_ACCESS_CODE && token.startsWith('owner.')) {
    const migrated = await env.DB.prepare("SELECT account_id FROM accounts WHERE role = 'owner' AND password_hash IS NOT NULL LIMIT 1").bind().first();
    if (migrated) return null;
    const match = /^owner\.(\d{13})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(token);
    if (!match || Number(match[1]) <= Date.now() || Number(match[1]) > Date.now() + 6 * 60 * 60_000) return null;
    const payload = `owner.${match[1]}.${match[2]}`;
    const expected = await ownerSignature(env.ADMIN_ACCESS_CODE, payload);
    if (!secretEqual(match[3], expected)) return null;
    return env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(OWNER_ACCOUNT).first()
      .then(row => row ? { ...row, role: 'admin' } : null);
  }
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare(`SELECT ${ACCOUNT_FIELDS.replaceAll(/\b(account_id|registered_at|verified_at|activated_at|qualified_deposit_cents|tier|limit_cycle_started_at|limit_cycle_reset_at|signals_used_in_cycle|credits_spent_in_cycle|role|password_hash|password_salt|password_iterations|must_change_password|session_version)\b/g, 'a.$1')} FROM sessions s
    JOIN accounts a ON a.account_id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND s.auth_version = a.session_version`).bind(await sha256(token), Date.now()).first();
}
function publicStatus(account, now = Date.now()) {
  if (account?.role === 'admin' || account?.role === 'owner') return { status: 'active', role: account.role, accountId: account.account_id === OWNER_ACCOUNT ? null : account.account_id, registeredAt: account.registered_at, verifiedAt: account.verified_at, tier: 'ULTRA', depositCents: account.qualified_deposit_cents || 0, modes: levelNamed('ULTRA').availableAiModes, signalsPerDay: null, aiCredits: null, creditsTotal: null, creditsRemaining: null, signalsUsed: 0, signalLimit: null, cycleStartedAt: null, cycleResetAt: null, mustChangePassword: Boolean(account.must_change_password), passwordConfigured: Boolean(account.password_hash), serverTime: now };
  if (!account) return { status: 'guest' };
  const special = account.account_id === UNLIMITED_ACCOUNT;
  const tier = special ? levelNamed('ULTRA') : levelNamed(account.tier);
  const activeCycle = account.limit_cycle_reset_at > now;
  const signalsUsed = activeCycle ? account.signals_used_in_cycle : 0;
  const creditsSpent = activeCycle ? account.credits_spent_in_cycle : 0;
  const next = LEVELS[LEVELS.indexOf(tier) + 1] || null;
  return {
    status: special || (account.activated_at && tier) ? 'active' : 'deposit',
    accountId: account.account_id, tier: tier?.name || null,
    depositCents: account.qualified_deposit_cents || 0,
    signalsPerDay: tier?.signalLimit ?? null, signalLimit: tier?.signalLimit ?? null,
    aiCredits: special ? null : tier?.creditsLimit ?? 0,
    creditsTotal: special ? null : tier?.creditsLimit ?? 0,
    creditsRemaining: special ? null : Math.max(0, (tier?.creditsLimit ?? 0) - creditsSpent),
    signalsUsed, creditsSpent, cycleStartedAt: activeCycle ? account.limit_cycle_started_at : null,
    cycleResetAt: activeCycle ? account.limit_cycle_reset_at : null,
    nextLevel: next?.id || null, nextLevelDepositCents: next?.minDeposit ?? null,
    modes: tier?.availableAiModes || [], special, role: account.role || 'user', registeredAt: account.registered_at, verifiedAt: account.verified_at,
    mustChangePassword: Boolean(account.must_change_password), passwordConfigured: Boolean(account.password_hash), serverTime: now,
  };
}
async function accountStatus(env, account) {
  return { ...publicStatus(account), creditsWindowHours: 24 };
}
async function syncDeposits(env, accountId, now = Date.now()) {
  await env.DB.prepare(`UPDATE accounts SET qualified_deposit_cents = COALESCE(
    (SELECT SUM(amount_cents) FROM deposit_events WHERE account_id = ?), 0)
    WHERE account_id = ?`).bind(accountId, accountId).run();
  if (accountId === UNLIMITED_ACCOUNT) return;
  await env.DB.prepare(`UPDATE accounts SET
    tier = CASE ${[...LEVELS].reverse().map(level => `WHEN qualified_deposit_cents >= ${level.minDeposit} THEN '${level.id}'`).join(' ')} ELSE NULL END,
    activated_at = CASE WHEN qualified_deposit_cents >= ${LEVELS[0].minDeposit}
      THEN COALESCE(activated_at, ?) ELSE NULL END
    WHERE account_id = ?`).bind(now, accountId).run();
}
async function limitClaims(request, env, scope = 'claim', limit = 10, window = 60_000) {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await sha256(`${scope}:${env.POSTBACK_SECRET || env.ADMIN_ACCESS_CODE}:${ip}`);
  const result = await env.DB.prepare(`INSERT INTO claim_attempts (ip_hash, created_at)
    SELECT ?, ? WHERE (SELECT COUNT(*) FROM claim_attempts WHERE ip_hash = ? AND created_at >= ?) < ?`)
    .bind(key, now, key, now - window, limit).run();
  if (!result.meta.changes) throw httpError(429, 'TOO_MANY_CLAIMS', scope === 'owner' ? 'Слишком много попыток. Попробуйте через 15 минут.' : 'Слишком много проверок ID. Попробуйте через минуту.');
}
async function ownerLogin(request, env) {
  if (!OWNER_CODE_PATTERN.test(env.ADMIN_ACCESS_CODE || '')) throw httpError(503, 'ADMIN_NOT_CONFIGURED', 'Вход владельца ещё не настроен');
  if (await env.DB.prepare("SELECT account_id FROM accounts WHERE role = 'owner' AND password_hash IS NOT NULL LIMIT 1").bind().first())
    throw httpError(410, 'OWNER_MIGRATED', 'Вход владельца перенесён на ID и пароль BLUFIN+');
  const { code } = await readJson(request, 1000);
  await limitClaims(request, env, 'owner', 5, 15 * 60_000);
  if (typeof code !== 'string' || !secretEqual(code, env.ADMIN_ACCESS_CODE)) {
    throw httpError(401, 'INVALID_ADMIN_CODE', 'Неверный код владельца');
  }
  const now = Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO accounts (account_id, registered_at, verified_at, activated_at) VALUES (?, ?, ?, ?)')
    .bind(OWNER_ACCOUNT, now, now, now).run();
  const payload = `owner.${now + 6 * 60 * 60_000}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
  return { status: 'active', role: 'admin', token: `${payload}.${await ownerSignature(env.ADMIN_ACCESS_CODE, payload)}` };
}
async function ownerStats(env) {
  const [accounts, registrations, deposits, analyses] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total, COUNT(activated_at) AS active FROM accounts WHERE account_id != ? AND role = 'user'").bind(OWNER_ACCOUNT).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM registration_events WHERE received_at >= ?').bind(0).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM deposit_events WHERE received_at >= ?').bind(0).first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM analyses WHERE status = 'done' AND verdict IN ('UP', 'DOWN') AND account_id != ?").bind(OWNER_ACCOUNT).first(),
  ]);
  return { accounts: accounts.total, active: accounts.active, registrations: registrations.total, deposits: deposits.total, analyses: analyses.total };
}
function ownerOnly(account) {
  if (!['admin', 'owner'].includes(account?.role) || account.must_change_password) throw httpError(403, 'FORBIDDEN', 'Доступ только для владельца');
}
function ownerUserStatus(row, now = Date.now()) {
  const status = publicStatus(row, now);
  return {
    accountId: row.account_id, registeredAt: row.registered_at, verifiedAt: row.verified_at,
    ...status, lastActiveAt: Math.max(row.last_analysis_at || 0, row.last_session_at || 0, row.verified_at || 0),
  };
}
async function ownerUsers(env, url) {
  const query = url.searchParams.get('q')?.trim() || '';
  const filter = url.searchParams.get('filter') || 'all';
  const page = Number(url.searchParams.get('page') || 0);
  if (!/^\d{0,16}$/.test(query) || !['all', 'BASE', 'PLUS', 'PRO', 'ADVANCED', 'ULTRA', 'active', 'no-access'].includes(filter)
      || !Number.isInteger(page) || page < 0 || page > 10000) throw httpError(400, 'INVALID_FILTER', 'Некорректный поиск или фильтр');
  let where = "a.account_id != ? AND a.role = 'user' AND a.account_id LIKE ?";
  const params = [OWNER_ACCOUNT, `%${query}%`];
  if (LEVELS.some(level => level.id === filter)) { where += ' AND a.tier = ?'; params.push(filter); }
  if (filter === 'active') where += " AND (a.activated_at IS NOT NULL AND a.tier IS NOT NULL OR a.account_id = '99105')";
  if (filter === 'no-access') where += " AND (a.activated_at IS NULL OR a.tier IS NULL) AND a.account_id != '99105'";
  const data = await env.DB.prepare(`SELECT a.*, (SELECT MAX(created_at) FROM analyses WHERE account_id = a.account_id AND status = 'done' AND verdict IN ('UP', 'DOWN')) AS last_analysis_at,
    (SELECT MAX(created_at) FROM sessions WHERE account_id = a.account_id) AS last_session_at
    FROM accounts a WHERE ${where} ORDER BY COALESCE(last_analysis_at, a.verified_at) DESC, a.account_id DESC LIMIT 26 OFFSET ?`)
    .bind(...params, page * 25).all();
  const rows = data.results.slice(0, 25);
  const usage = rows.length ? await env.DB.prepare(`SELECT x.account_id, COALESCE(x.mode, 'Fast') AS mode, COUNT(*) AS lifetime,
    SUM(CASE WHEN a.limit_cycle_reset_at > ? AND x.created_at >= a.limit_cycle_started_at THEN 1 ELSE 0 END) AS cycle
    FROM analyses x JOIN accounts a ON a.account_id = x.account_id
    WHERE x.account_id IN (${rows.map(() => '?').join(',')}) AND x.status = 'done' AND x.verdict IN ('UP', 'DOWN')
    GROUP BY x.account_id, COALESCE(x.mode, 'Fast')`).bind(Date.now(), ...rows.map(row => row.account_id)).all() : { results: [] };
  const users = rows.map(row => ({ ...ownerUserStatus(row), aiUsage: Object.fromEntries(
    usage.results.filter(item => item.account_id === row.account_id).map(item => [item.mode, { cycle: item.cycle, lifetime: item.lifetime }])
  ) }));
  return { users, hasMore: data.results.length > 25, page, serverTime: Date.now() };
}
async function ownerUserDetails(env, accountId, url) {
  if (!id(accountId)) throw httpError(400, 'INVALID_ID', 'Некорректный ID');
  const page = Number(url.searchParams.get('page') || 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000) throw httpError(400, 'INVALID_PAGE', 'Некорректная страница');
  const row = await env.DB.prepare(`SELECT a.*, (SELECT MAX(created_at) FROM analyses WHERE account_id = a.account_id AND status = 'done' AND verdict IN ('UP', 'DOWN')) AS last_analysis_at,
    (SELECT MAX(created_at) FROM sessions WHERE account_id = a.account_id) AS last_session_at
    FROM accounts a WHERE a.account_id = ?`).bind(accountId).first();
  if (!row) throw httpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  const [deposits, counts, signals] = await Promise.all([
    env.DB.prepare('SELECT event_id, amount_cents, received_at FROM deposit_events WHERE account_id = ? ORDER BY received_at DESC LIMIT 50').bind(accountId).all(),
    env.DB.prepare(`SELECT COALESCE(mode, 'Fast') AS mode, COUNT(*) AS lifetime,
      SUM(CASE WHEN created_at >= ? AND ? > ? THEN 1 ELSE 0 END) AS cycle
      FROM analyses WHERE account_id = ? AND status = 'done' AND verdict IN ('UP', 'DOWN') GROUP BY COALESCE(mode, 'Fast')`)
      .bind(row.limit_cycle_started_at || 0, row.limit_cycle_reset_at || 0, Date.now(), accountId).all(),
    env.DB.prepare(`SELECT id, asset, mode, verdict, created_at, signal_expires_at FROM analyses
      WHERE account_id = ? AND status = 'done' AND verdict IN ('UP', 'DOWN') ORDER BY created_at DESC LIMIT 11 OFFSET ?`).bind(accountId, page * 10).all(),
  ]);
  return {
    user: ownerUserStatus(row),
    deposits: deposits.results.map(item => ({ eventId: item.event_id, amountCents: item.amount_cents, confirmedAt: item.received_at })),
    aiUsage: Object.fromEntries(counts.results.map(item => [item.mode, { cycle: item.cycle, lifetime: item.lifetime }])),
    signals: signals.results.slice(0, 10).map(item => ({ id: item.id, pair: item.asset, mode: item.mode,
      verdict: item.verdict, createdAt: item.created_at, expiresAt: item.signal_expires_at })),
    hasMoreSignals: signals.results.length > 10, signalPage: page, serverTime: Date.now(),
  };
}
async function login(request, env) {
  const { accountId, password, remember = false } = await readJson(request, 2000);
  if (typeof password !== 'string' || password.length > 128) throw httpError(401, 'INVALID_LOGIN', 'Неверный ID или пароль');
  const normalizedId = id(accountId) ? accountId : 'invalid';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const keys = await Promise.all([`ip:${ip}`, `id:${normalizedId}`].map(value => sha256(`BLUFIN_LOGIN:${env.POSTBACK_SECRET || env.ADMIN_ACCESS_CODE}:${value}`)));
  const windowStart = Date.now() - 15 * 60_000;
  for (const key of keys) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM login_attempts WHERE key_hash = ? AND created_at >= ?').bind(key, windowStart).first();
    if (count.total >= 5) throw httpError(429, 'LOGIN_LIMIT', 'Слишком много попыток. Попробуйте через 15 минут.');
  }
  const account = normalizedId === 'invalid' ? null : await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(normalizedId).first();
  const salt = account?.password_salt || '00000000000000000000000000000000';
  const computed = await passwordHash(password, salt, account?.password_iterations || PASSWORD_ITERATIONS);
  if (!account?.password_hash || !secretEqual(computed, account.password_hash)) {
    await env.DB.batch(keys.map(key => env.DB.prepare('INSERT INTO login_attempts (key_hash, created_at) VALUES (?, ?)').bind(key, Date.now())));
    throw httpError(401, 'INVALID_LOGIN', 'Неверный ID или пароль');
  }
  const token = await issueSession(env, account, remember === true);
  return { ...await accountStatus(env, account), token };
}
async function setupPassword(request, env) {
  const account = await currentAccount(request, env);
  if (!account || account.role === 'admin' || account.password_hash || !account.verified_at)
    throw httpError(403, 'SETUP_UNAVAILABLE', 'Создание пароля сейчас недоступно');
  const { password } = await readJson(request, 2000);
  if (!validPassword(password)) throw httpError(400, 'WEAK_PASSWORD', 'Пароль должен содержать от 10 до 128 символов');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(password, salt);
  const changed = await env.DB.prepare('UPDATE accounts SET password_hash = ?, password_salt = ?, password_iterations = ?, session_version = session_version + 1 WHERE account_id = ? AND password_hash IS NULL')
    .bind(hash, salt, PASSWORD_ITERATIONS, account.account_id).run();
  if (!changed.meta.changes) throw httpError(409, 'ACCOUNT_EXISTS', 'Пароль уже создан. Войдите в аккаунт.');
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(account.account_id).run();
  const updated = await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(account.account_id).first();
  return { ...await accountStatus(env, updated), token: await issueSession(env, updated) };
}
async function changePassword(request, env) {
  const account = await currentAccount(request, env);
  if (!account || account.role === 'admin' || !account.password_hash) throw httpError(401, 'UNAUTHORIZED', 'Войдите по ID и паролю');
  const { currentPassword, newPassword } = await readJson(request, 2500);
  if (!validPassword(newPassword)) throw httpError(400, 'WEAK_PASSWORD', 'Новый пароль должен содержать от 10 до 128 символов');
  if (typeof currentPassword !== 'string' || !secretEqual(await passwordHash(currentPassword, account.password_salt, account.password_iterations), account.password_hash))
    throw httpError(401, 'INVALID_PASSWORD', 'Текущий пароль неверен');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(newPassword, salt);
  await env.DB.prepare('UPDATE accounts SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0, session_version = session_version + 1 WHERE account_id = ?')
    .bind(hash, salt, PASSWORD_ITERATIONS, account.account_id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(account.account_id).run();
  const updated = await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(account.account_id).first();
  return { ...await accountStatus(env, updated), token: await issueSession(env, updated) };
}
async function ownerResetPassword(request, env, accountId) {
  if (!id(accountId)) throw httpError(400, 'INVALID_ID', 'Некорректный ID');
  const { temporaryPassword } = await readJson(request, 2000);
  if (!validPassword(temporaryPassword)) throw httpError(400, 'WEAK_PASSWORD', 'Временный пароль должен содержать от 10 до 128 символов');
  const target = await env.DB.prepare("SELECT account_id FROM accounts WHERE account_id = ? AND role = 'user' AND password_hash IS NOT NULL").bind(accountId).first();
  if (!target) throw httpError(404, 'USER_NOT_FOUND', 'Аккаунт с паролем не найден');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(temporaryPassword, salt);
  await env.DB.prepare('UPDATE accounts SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 1, session_version = session_version + 1 WHERE account_id = ?')
    .bind(hash, salt, PASSWORD_ITERATIONS, accountId).run();
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId).run();
  return { ok: true, mustChangePassword: true };
}
async function migrateOwner(request, env) {
  const owner = await currentAccount(request, env);
  if (owner?.role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Доступ только для владельца');
  const { accountId, password } = await readJson(request, 2000);
  if (!id(accountId) || !validPassword(password)) throw httpError(400, 'INVALID_INPUT', 'Нужны Binadex ID и пароль от 10 символов');
  if (await env.DB.prepare("SELECT account_id FROM accounts WHERE role = 'owner' AND password_hash IS NOT NULL LIMIT 1").bind().first())
    throw httpError(409, 'OWNER_EXISTS', 'Владелец уже настроен');
  if (!await trader(env, accountId)) throw httpError(404, 'ID_NOT_FOUND', 'Binadex ID не найден');
  const current = await env.DB.prepare('SELECT password_hash FROM accounts WHERE account_id = ?').bind(accountId).first();
  if (current?.password_hash) throw httpError(409, 'ACCOUNT_EXISTS', 'У этого ID уже создан пароль');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(password, salt);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO accounts (account_id, registered_at, verified_at, activated_at, role, password_hash, password_salt, password_iterations, session_version)
    VALUES (?, ?, ?, ?, 'owner', ?, ?, ?, 1) ON CONFLICT(account_id) DO UPDATE SET
      role = 'owner', password_hash = excluded.password_hash, password_salt = excluded.password_salt,
      password_iterations = excluded.password_iterations, session_version = accounts.session_version + 1
    WHERE accounts.password_hash IS NULL`).bind(accountId, now, now, now, hash, salt, PASSWORD_ITERATIONS).run();
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId).run();
  const account = await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(accountId).first();
  return { ...await accountStatus(env, account), token: await issueSession(env, account) };
}
async function claim(request, env) {
  const { accountId } = await readJson(request, 1000);
  if (!id(accountId)) throw httpError(404, 'ID_NOT_FOUND', 'Ваш ID не найден. Зарегистрируйтесь по нашей ссылке.');
  if (await env.DB.prepare('SELECT account_id FROM accounts WHERE account_id = ? AND password_hash IS NOT NULL').bind(accountId).first())
    throw httpError(409, 'ACCOUNT_EXISTS', 'Аккаунт уже создан. Войдите по ID и паролю BLUFIN+.');
  const unlimited = accountId === UNLIMITED_ACCOUNT;
  if (!unlimited && !env.POSTBACK_SECRET) throw httpError(503, 'POSTBACK_NOT_CONFIGURED', 'Подтверждение депозита ещё не подключено');
  await limitClaims(request, env);
  if (!unlimited) {
    const details = await trader(env, accountId);
    if (!details) throw httpError(404, 'ID_NOT_FOUND', 'Ваш ID не найден. Для доступа создайте аккаунт по нашей ссылке и дождитесь регистрации.');
  }
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO accounts (account_id, registered_at, verified_at, activated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET
    verified_at = excluded.verified_at, activated_at = COALESCE(accounts.activated_at, excluded.activated_at)`)
    .bind(accountId, now, now, unlimited ? now : null).run();
  // Postbacks can arrive before the visitor claims their ID.
  await syncDeposits(env, accountId, now);
  const account = await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(accountId).first();
  return { ...await accountStatus(env, account), token: await issueSession(env, account) };
}
function cents(amount) {
  if (typeof amount !== 'string' && typeof amount !== 'number') return null;
  const text = String(amount);
  if (!/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
async function postback(request, env) {
  if (!env.POSTBACK_SECRET) throw httpError(503, 'POSTBACK_NOT_CONFIGURED', 'Postback ещё не подключён');
  const isGet = request.method === 'GET';
  const query = isGet ? new URL(request.url).searchParams : null;
  const credential = isGet ? query.get('token') : bearer(request);
  if (!secretEqual(credential, env.POSTBACK_SECRET)) throw httpError(401, 'UNAUTHORIZED', 'Неверный секрет postback');
  const payload = isGet ? {
    event: query.get('event'), account_id: query.get('a'), event_id: query.get('id'),
    amount: query.get('amount'), currency: query.get('currency'),
  } : await readJson(request, 16_000);
  const accountId = String(payload.account_id ?? '');
  if (payload.event === 'registration') {
    if (!id(accountId) || !eventId(payload.event_id)) {
      throw httpError(400, 'INVALID_EVENT', 'Нужны event=registration, a и id');
    }
    const saved = await env.DB.prepare('INSERT OR IGNORE INTO registration_events (event_id, account_id, received_at) VALUES (?, ?, ?)')
      .bind(payload.event_id, accountId, Date.now()).run();
    return { ok: true, duplicate: !saved.meta.changes };
  }
  const amount = cents(payload.amount);
  if (payload.event !== 'deposit' || !id(accountId) || !eventId(payload.event_id) || payload.currency !== 'USD' || amount === null || amount <= 0) {
    throw httpError(400, 'INVALID_EVENT', 'Нужны event=deposit, ID трейдера, ID события, сумма и currency=USD');
  }
  const now = Date.now();
  const saved = await env.DB.prepare('INSERT OR IGNORE INTO deposit_events (event_id, account_id, amount_cents, received_at) VALUES (?, ?, ?, ?)')
    .bind(payload.event_id, accountId, amount, now).run();
  if (!saved.meta.changes) return { ok: true, duplicate: true };
  await syncDeposits(env, accountId, now);
  const total = await env.DB.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM deposit_events WHERE account_id = ?').bind(accountId).first();
  return { ok: true, status: total.total >= LEVELS[0].minDeposit ? 'eligible' : 'below_minimum', tier: levelFor(total.total)?.name || null };
}

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    pair: { type: ['string', 'null'] },
    current_price: { type: ['string', 'null'] },
    timeframe: { type: ['string', 'null'] },
    chart_visible: { type: 'boolean' },
    recent_candles_visible: { type: 'boolean' },
    sufficient_history: { type: 'boolean' },
    verdict: { type: 'string', enum: ['UP', 'DOWN'] },
    trend: { type: 'string' }, structure: { type: 'string' },
    momentum: { type: 'string' }, volatility: { type: 'string' },
    historical_match: { type: 'string' }, ai_consensus: { type: 'string' },
    key_levels: { type: 'string' }, setup: { type: 'string' },
    reason: { type: 'string' }, invalidation: { type: 'string' },
    limitations: { type: 'string' }, final_conclusion: { type: 'string' },
  },
  required: ['pair', 'current_price', 'timeframe', 'chart_visible', 'recent_candles_visible', 'sufficient_history', 'verdict',
    'trend', 'structure', 'momentum', 'volatility', 'historical_match', 'ai_consensus',
    'key_levels', 'setup', 'reason', 'invalidation', 'limitations', 'final_conclusion'],
};
const DESCRIPTION_FIELDS = ['trend', 'structure', 'momentum', 'volatility', 'historical_match', 'ai_consensus',
  'key_levels', 'setup', 'reason', 'invalidation', 'limitations', 'final_conclusion'];
function responseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  return (data?.output || []).filter(item => item.type === 'message')
    .flatMap(item => item.content || []).filter(item => item.type === 'output_text')
    .map(item => item.text || '').join('');
}
async function analyzeImage(env, image, mode, expiry) {
  if (!env.OPENAI_API_KEY) throw httpError(503, 'AI_NOT_CONFIGURED', 'Анализ ещё не подключён');
  const model = env.OPENAI_MODEL || 'gpt-5-mini';
  const tokenLimits = { Fast: [6000, 10000], Deep: [9000, 14000], Maximum: [12000, 18000] }[mode];
  for (const [attempt, maxOutputTokens] of tokenLimits.entries()) {
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.timeout(90_000),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, store: false, max_output_tokens: maxOutputTokens,
          ...(model.startsWith('gpt-5') ? { reasoning: { effort: 'low' } } : {}),
          text: { format: { type: 'json_schema', name: 'chart_analysis', strict: true, schema } },
          instructions: `Ты аналитик графиков. Отвечай на русском ${mode === 'Fast' ? 'кратко' : mode === 'Deep' ? 'с разбором видимой структуры и альтернатив' : 'подробно, с оценкой видимых признаков и противоположного сценария'}. Сначала прочитай с изображения торговую пару (pair, например EUR/USD), текущую цену (current_price) и таймфрейм (timeframe, например M1). Если любой параметр не читается, верни для него null, никогда не угадывай. Выставь chart_visible, recent_candles_visible и sufficient_history в true только если реально видны график, последние свечи и достаточная история. Пара должна быть из списка: ${ASSETS.join(', ')}. OTC и другие пары не подходят. Если скриншот пригоден для анализа, выбери только UP или DOWN по видимым признакам. Не выдумывай живые котировки, внешнюю историю, другие таймфреймы и индикаторы. historical_match описывает только паттерны на скриншоте, ai_consensus означает согласованность видимых признаков. Выбранная пользователем экспирация: ${expiry} мин. Учитывай её при анализе, не выбирай другую длительность. Пиши кратко, по 1-2 предложения на поле, и не обещай результата. Если данных для отдельного текстового поля нет, так и скажи в этом поле.`,
          input: [{ role: 'user', content: [
            { type: 'input_text', text: `Проанализируй видимый график для экспирации ${expiry} мин. Определи параметры по скриншоту.` },
            { type: 'input_image', image_url: image, detail: 'high' },
          ] }],
        }),
      });
    } catch (cause) {
      console.warn('AI transport failed', { attempt, reason: cause?.name || 'network' });
      if (attempt === tokenLimits.length - 1) throw httpError(502, 'AI_UNAVAILABLE', 'Сервис анализа не ответил. Попробуйте повторить.');
      continue;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn('AI API rejected request', { status: response.status, code: data?.error?.code, type: data?.error?.type });
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < tokenLimits.length - 1) continue;
      throw httpError(502, 'AI_UNAVAILABLE', 'Сервис анализа сейчас недоступен. Попробуйте позже.');
    }
    if (data?.status !== 'completed') {
      console.warn('AI response not completed', { attempt, status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage?.output_tokens });
      if (data?.status === 'incomplete' && data?.incomplete_details?.reason === 'max_output_tokens' && attempt < tokenLimits.length - 1) continue;
      throw httpError(502, 'AI_UNAVAILABLE', 'Анализ не завершился. Попробуйте повторить.');
    }
    let result;
    try { result = JSON.parse(responseText(data)); } catch {
      console.warn('AI response has no valid JSON', { attempt, responseId: data?.id });
      continue;
    }
    if (!result || typeof result !== 'object' || !['UP', 'DOWN'].includes(result.verdict) ||
        !['chart_visible', 'recent_candles_visible', 'sufficient_history'].every(field => typeof result[field] === 'boolean') ||
        !['pair', 'timeframe', 'current_price'].every(field => result[field] === null || typeof result[field] === 'string') ||
        !DESCRIPTION_FIELDS.every(field => typeof result[field] === 'string')) {
      console.warn('AI response failed shape validation', { attempt, responseId: data?.id });
      continue;
    }
    for (const field of DESCRIPTION_FIELDS) if (!result[field].trim()) result[field] = 'Недостаточно данных на скриншоте.';
    result.signal_duration_minutes = expiry;
    return result;
  }
  throw httpError(502, 'AI_INVALID_RESPONSE', 'Ответ анализа не был готов. AI Credits не списаны. Попробуйте повторить.');
}
function validImage(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const bytes = Math.floor(match[2].length * 3 / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (bytes < 2000 || bytes > 3_500_000) return false;
  const prefix = atob(match[2].slice(0, 24));
  return match[1] === 'jpeg' ? prefix.charCodeAt(0) === 255 && prefix.charCodeAt(1) === 216
    : match[1] === 'png' ? prefix.startsWith('\x89PNG') : prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
}
async function analyze(request, env, account) {
  if (account && account.role !== 'admin' && !account.password_hash) throw httpError(403, 'PASSWORD_SETUP_REQUIRED', 'Сначала создайте пароль BLUFIN+');
  if (account?.must_change_password) throw httpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Сначала смените временный пароль');
  const privileged = account?.role === 'admin' || account?.role === 'owner' || account?.account_id === UNLIMITED_ACCOUNT;
  const tier = privileged ? levelNamed('ULTRA') : levelNamed(account?.tier);
  if (!account || (!privileged && (!account.activated_at || !tier))) throw httpError(403, 'LOCKED', 'Доступ не активирован');
  if (!env.OPENAI_API_KEY) throw httpError(503, 'AI_NOT_CONFIGURED', 'Анализ ещё не подключён');
  const { image, mode = 'Fast', expiry = 3 } = await readJson(request);
  if (!Number.isInteger(expiry) || !EXPIRIES.includes(expiry)) throw httpError(400, 'INVALID_EXPIRY', 'Выберите экспирацию 1, 3, 5 или 15 минут');
  if (!tier.availableAiModes.includes(mode)) throw httpError(403, 'MODE_LOCKED', 'Этот режим доступен на более высоком уровне');
  if (!validImage(image)) throw httpError(400, 'INVALID_IMAGE', 'Загрузите JPG, PNG или WebP размером до 3,5 МБ');
  const now = Date.now();
  const cooldown = Math.max(0, Number(env.ANALYSIS_COOLDOWN_SECONDS ?? 45)) * 1000;
  const cost = AI_MODES[mode].cost;
  const state = publicStatus(account, now);
  if (!privileged && state.signalLimit !== null && state.signalsUsed >= state.signalLimit)
    throw httpError(403, 'SIGNALS_EXHAUSTED', 'Лимит сигналов текущего периода исчерпан.');
  if (!privileged && state.creditsRemaining < cost)
    throw httpError(403, 'CREDITS_EXHAUSTED', 'Недостаточно AI Credits для выбранного режима.');
  const analysisId = crypto.randomUUID();
  // One pending request per account. The INSERT predicate is a single atomic D1 write.
  const reservation = await env.DB.prepare(`INSERT INTO analyses
    (id, account_id, asset, expiry, verdict, result_json, created_at, status, mode, cost_credits)
    SELECT ?, a.account_id, '[по скриншоту]', ?, 'UP', '{}', ?, 'pending', ?, 0
    FROM accounts a WHERE a.account_id = ?
    AND NOT EXISTS (SELECT 1 FROM analyses WHERE account_id = a.account_id AND status = 'pending' AND created_at > ?)
    AND (? = 1 OR NOT EXISTS (SELECT 1 FROM analyses WHERE account_id = a.account_id AND status = 'done'
      AND created_at > ?))
    AND (? = 1 OR (a.activated_at IS NOT NULL AND a.tier = ?
      AND (a.limit_cycle_reset_at IS NULL OR a.limit_cycle_reset_at <= ? OR a.signals_used_in_cycle < ?)
      AND (CASE WHEN a.limit_cycle_reset_at > ? THEN a.credits_spent_in_cycle ELSE 0 END) + ? <= ?))`)
    .bind(analysisId, expiry, now, mode, account.account_id, now - 300_000, privileged ? 1 : 0, now - cooldown,
      privileged ? 1 : 0, tier.id, now, tier.signalLimit ?? 2147483647, now, cost, tier.creditsLimit).run();
  if (!reservation.meta.changes) throw httpError(429, 'RATE_LIMIT', 'Запрос уже выполняется, действует пауза между сигналами или лимит исчерпан.');
  try {
    const result = await analyzeImage(env, image, mode, expiry);
    const pairText = typeof result.pair === 'string' ? result.pair.trim().toUpperCase().replace(/[\s-]/g, '') : '';
    result.pair = ASSETS.find(asset => asset === pairText || asset.replace('/', '') === pairText) || null;
    const timeframeText = typeof result.timeframe === 'string' ? result.timeframe.trim().toUpperCase().replace(/\s/g, '') : '';
    result.timeframe = /^(?:M|H)[1-9][0-9]?$/.test(timeframeText) ? timeframeText
      : /^([1-9][0-9]?)(M|H)$/.test(timeframeText) ? timeframeText.replace(/^([1-9][0-9]?)(M|H)$/, '$2$1') : null;
    result.current_price = typeof result.current_price === 'string' ? result.current_price.trim().replace(/[\s\u00a0]/g, '').replace(',', '.') : null;
    if (!result.pair || !ASSETS.includes(result.pair))
      throw httpError(422, 'SCREENSHOT_INCOMPLETE', 'Не удалось определить поддерживаемую торговую пару. Загрузите полный скриншот с названием пары.');
    if (!result.timeframe || !/^(?:M[1-9][0-9]?|H[1-9][0-9]?)$/.test(result.timeframe))
      throw httpError(422, 'SCREENSHOT_INCOMPLETE', 'Не удалось определить таймфрейм. Загрузите скриншот, на котором он хорошо виден.');
    if (!result.current_price || !/^[0-9]{1,12}(?:\.[0-9]{1,8})?$/.test(result.current_price) || Number(result.current_price) <= 0)
      throw httpError(422, 'SCREENSHOT_INCOMPLETE', 'Не удалось определить текущую цену. Загрузите скриншот, на котором она хорошо видна.');
    if (!result.chart_visible || !result.recent_candles_visible || !result.sufficient_history)
      throw httpError(422, 'SCREENSHOT_INCOMPLETE', 'На скриншоте недостаточно графика или последних свечей. Загрузите полный график с видимой историей.');
    const createdAt = Date.now();
    const signalDuration = expiry * 60;
    const signalExpiresAt = createdAt + signalDuration * 1000;
    const latestAccount = !privileged
      ? await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(account.account_id).first()
      : account;
    const currentTier = privileged ? tier : levelNamed(latestAccount?.tier);
    if (!privileged && (!latestAccount?.activated_at || !currentTier?.availableAiModes.includes(mode)))
      throw httpError(409, 'ACCOUNT_CHANGED', 'Доступ изменился во время анализа. Повторите запрос.');
    const saveResult = env.DB.prepare(`UPDATE analyses SET status = 'done', verdict = ?, result_json = ?, created_at = ?,
      asset = ?, expiry = ?, cost_credits = ?, signal_duration_seconds = ?, signal_expires_at = ?
      WHERE id = ? AND status = 'pending' AND (? = 1 OR EXISTS
        (SELECT 1 FROM accounts WHERE account_id = ? AND last_committed_analysis_id = ?))`)
      .bind(result.verdict, JSON.stringify(result), createdAt, result.pair, result.signal_duration_minutes,
        cost, signalDuration, signalExpiresAt, analysisId,
        privileged ? 1 : 0, account.account_id, analysisId);
    if (!privileged) {
      // Both writes commit together. The second is gated by the account update's marker.
      const [commit, saved] = await env.DB.batch([
        env.DB.prepare(`UPDATE accounts SET
          limit_cycle_started_at = CASE WHEN limit_cycle_reset_at > ? THEN limit_cycle_started_at ELSE ? END,
          limit_cycle_reset_at = CASE WHEN limit_cycle_reset_at > ? THEN limit_cycle_reset_at ELSE ? END,
          signals_used_in_cycle = CASE WHEN limit_cycle_reset_at > ? THEN signals_used_in_cycle + 1 ELSE 1 END,
          credits_spent_in_cycle = CASE WHEN limit_cycle_reset_at > ? THEN credits_spent_in_cycle + ? ELSE ? END,
          last_committed_analysis_id = ?
          WHERE account_id = ? AND activated_at IS NOT NULL AND tier = ?
          AND EXISTS (SELECT 1 FROM analyses WHERE id = ? AND status = 'pending' AND account_id = accounts.account_id)
          AND (limit_cycle_reset_at IS NULL OR limit_cycle_reset_at <= ? OR signals_used_in_cycle < ?)
          AND (CASE WHEN limit_cycle_reset_at > ? THEN credits_spent_in_cycle ELSE 0 END) + ? <= ?`)
          .bind(createdAt, createdAt, createdAt, createdAt + DAY, createdAt, createdAt, cost, cost,
            analysisId, account.account_id, currentTier.id, analysisId, createdAt, currentTier.signalLimit ?? 2147483647,
            createdAt, cost, currentTier.creditsLimit),
        saveResult,
      ]);
      if (!commit.meta.changes || !saved.meta.changes)
        throw httpError(409, 'ACCOUNT_CHANGED', 'Уровень или лимит изменился во время анализа. Повторите запрос.');
    } else {
      await saveResult.run();
    }
    const current = privileged ? account : await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`).bind(account.account_id).first();
    return { id: analysisId, asset: result.pair, mode, created_at: createdAt,
      signalCreatedAt: createdAt,
      signalExpiresAt, signalDuration, serverTime: Date.now(),
      account: await accountStatus(env, current), result };
  } catch (error) {
    await env.DB.prepare('DELETE FROM analyses WHERE id = ? AND status = ?').bind(analysisId, 'pending').run();
    throw error;
  }
}

async function handler(request, env) {
  const origin = request.headers.get('Origin');
  const headers = cors(origin, env);
  const route = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: origin && origin === env.SITE_ORIGIN ? 204 : 403, headers });
  if (origin && origin !== env.SITE_ORIGIN && route !== '/api/postback') return error(403, 'FORBIDDEN_ORIGIN', 'Недопустимый источник');
  if (route === '/api/config' && request.method === 'GET') return json({
    referralUrl: env.REFERRAL_URL || 'https://bdclick.app/smart/site',
    attributionConfigured: Boolean(env.PARTNER_API_KEY && env.POSTBACK_SECRET && env.DB),
    adminConfigured: Boolean(env.DB && OWNER_CODE_PATTERN.test(env.ADMIN_ACCESS_CODE || '')),
    assets: ASSETS, expiries: EXPIRIES, analysisApiVersion: 2, levels: LEVELS, aiModes: AI_MODES,
  }, 200, headers);
  if (route === '/go' && request.method === 'GET') {
    if (!env.PARTNER_API_KEY || !env.POSTBACK_SECRET) return error(503, 'NOT_CONFIGURED', 'Регистрация пока не подключена', headers);
    return Response.redirect(env.REFERRAL_URL || 'https://bdclick.app/smart/site', 302);
  }
  if (!env.DB) return error(503, 'DATABASE_NOT_CONFIGURED', 'База пока не подключена', headers);
  try {
    if (route === '/api/postback' && (request.method === 'POST' || request.method === 'GET')) return json(await postback(request, env), 200, headers);
    if (route === '/api/auth/login' && request.method === 'POST') return json(await login(request, env), 200, headers);
    if (route === '/api/auth/setup' && request.method === 'POST') return json(await setupPassword(request, env), 200, headers);
    if (route === '/api/auth/change-password' && request.method === 'POST') return json(await changePassword(request, env), 200, headers);
    if (route === '/api/auth/logout' && request.method === 'POST') {
      const token = bearer(request);
      if (/^[0-9a-f]{64}$/.test(token)) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      return json({ ok: true }, 200, headers);
    }
    if (route === '/api/auth/logout-all' && request.method === 'POST') {
      const account = await currentAccount(request, env);
      if (!account || account.role === 'admin') return error(401, 'UNAUTHORIZED', 'Войдите в аккаунт', headers);
      await env.DB.prepare('UPDATE accounts SET session_version = session_version + 1 WHERE account_id = ?').bind(account.account_id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(account.account_id).run();
      return json({ ok: true }, 200, headers);
    }
    if (route === '/api/admin/login' && request.method === 'POST') return json(await ownerLogin(request, env), 200, headers);
    if (route === '/api/admin/migrate-owner' && request.method === 'POST') return json(await migrateOwner(request, env), 200, headers);
    if (route === '/api/admin/stats' && request.method === 'GET') {
      const account = await currentAccount(request, env);
      return ['admin', 'owner'].includes(account?.role) && !account.must_change_password ? json(await ownerStats(env), 200, headers) : error(403, 'FORBIDDEN', 'Доступ только для владельца', headers);
    }
    if (route === '/api/admin/users' && request.method === 'GET') {
      ownerOnly(await currentAccount(request, env));
      return json(await ownerUsers(env, new URL(request.url)), 200, headers);
    }
    const ownerUserRoute = /^\/api\/admin\/users\/([1-9][0-9]{0,15})(\/refresh)?$/.exec(route);
    if (ownerUserRoute && (request.method === 'GET' || request.method === 'POST')) {
      ownerOnly(await currentAccount(request, env));
      if (request.method === 'POST' && ownerUserRoute[2]) {
        await syncDeposits(env, ownerUserRoute[1]);
        return json(await ownerUserDetails(env, ownerUserRoute[1], new URL(request.url)), 200, headers);
      }
      if (request.method === 'GET' && !ownerUserRoute[2])
        return json(await ownerUserDetails(env, ownerUserRoute[1], new URL(request.url)), 200, headers);
    }
    const resetRoute = /^\/api\/admin\/users\/([1-9][0-9]{0,15})\/reset-password$/.exec(route);
    if (resetRoute && request.method === 'POST') {
      ownerOnly(await currentAccount(request, env));
      return json(await ownerResetPassword(request, env, resetRoute[1]), 200, headers);
    }
    if (route === '/api/claim' && request.method === 'POST') return json(await claim(request, env), 200, headers);
    if (route === '/api/me' && request.method === 'GET') return json(await accountStatus(env, await currentAccount(request, env)), 200, headers);
    if (route === '/api/activation/check' && request.method === 'POST') {
      const account = await currentAccount(request, env);
      if (!account) return error(401, 'UNAUTHORIZED', 'Сначала подтвердите ID аккаунта', headers);
      if (account.role === 'admin' || account.role === 'owner') return json(await accountStatus(env, account), 200, headers);
      await syncDeposits(env, account.account_id);
      const refreshed = await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE account_id = ?`)
        .bind(account.account_id).first();
      return json(await accountStatus(env, refreshed), 200, headers);
    }
    if (route === '/api/history' && request.method === 'GET') {
      const account = await currentAccount(request, env);
      if (account && account.role !== 'admin' && (!account.password_hash || account.must_change_password))
        return error(403, 'PASSWORD_REQUIRED', 'Сначала настройте пароль BLUFIN+', headers);
      if (!account || (account.role !== 'admin' && account.role !== 'owner' && account.account_id !== UNLIMITED_ACCOUNT && (!account.activated_at || !levelNamed(account.tier))))
        return error(403, 'LOCKED', 'Доступ не активирован', headers);
      const data = await env.DB.prepare(`SELECT id, asset, expiry, verdict, result_json, created_at,
        mode, signal_duration_seconds, signal_expires_at
        FROM analyses WHERE account_id = ? AND status = 'done' AND verdict IN ('UP', 'DOWN') ORDER BY created_at DESC LIMIT 8`).bind(account.account_id).all();
      return json({ serverTime: Date.now(), analyses: data.results.map(item => ({
        id: item.id, asset: item.asset, mode: item.mode, created_at: item.created_at,
        signalCreatedAt: item.signal_expires_at ? item.created_at : null,
        signalExpiresAt: item.signal_expires_at, signalDuration: item.signal_duration_seconds,
        result: JSON.parse(item.result_json),
      })) }, 200, headers);
    }
    if (route === '/api/analyze' && request.method === 'POST') return json(await analyze(request, env, await currentAccount(request, env)), 200, headers);
    return error(404, 'NOT_FOUND', 'Маршрут не найден', headers);
  } catch (cause) {
    if (!cause.status) console.error('Worker request failed:', cause);
    return error(cause.status || 500, cause.code || 'SERVER_ERROR', cause.status ? cause.message : 'Временная ошибка. Попробуйте позже.', headers);
  }
}

export { analyzeImage, analyze };
export default {
  fetch: handler,
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM claim_attempts WHERE created_at < ?').bind(now - DAY),
      env.DB.prepare("DELETE FROM analyses WHERE status = 'pending' AND created_at < ?").bind(now - DAY),
      env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(now - DAY),
    ]);
  },
};
