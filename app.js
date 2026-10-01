const $ = selector => document.querySelector(selector);
const t = (key, ...values) => window.BluFinI18n.t(key, ...values);
const locale = () => window.BluFinI18n.language === 'ru' ? 'ru-RU' : 'en-US';
const SESSION_KEY = 'blufin_session';
const state = { status: 'loading', role: null, accountId: null, account: null, file: null, mode: 'Fast', expiry: 3, config: null, polling: null, resultTimer: null, latestResult: null, dismissedResultId: null, clockOffset: 0, ownerFilter: 'all', ownerPage: 0, ownerUserId: null, token: localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY), historyItems: [], historyPage: 0, historyQuery: '', historyFilters: {}, historyLoading: false };
function removeSession() { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }
const views = ['landing', 'login', 'register', 'access', 'password-setup', 'deposit', 'dashboard', 'history', 'level', 'account', 'settings', 'owner-stats-view'];
const apiBase = (window.BLUFIN_API_BASE || '').replace(/\/$/, '');
const staticPreview = window.BLUFIN_STATIC_PREVIEW === true && !apiBase;
const fallbackLevels = [
  { id: 'BASE', minDeposit: 2000, signalLimit: 3, creditsLimit: 30, availableAiModes: ['Fast'], color: '#B2BDD0' },
  { id: 'PLUS', minDeposit: 5000, signalLimit: 10, creditsLimit: 300, availableAiModes: ['Fast', 'Deep'], color: '#5796FF' },
  { id: 'PRO', minDeposit: 7500, signalLimit: 30, creditsLimit: 1000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#B58AFF' },
  { id: 'ADVANCED', minDeposit: 10000, signalLimit: 70, creditsLimit: 3000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#FF788B' },
  { id: 'ULTRA', minDeposit: 20000, signalLimit: null, creditsLimit: 10000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#F6C75D' },
];
function levels() {
  const configured = state.config?.levels?.length === 5 ? state.config.levels : fallbackLevels;
  return configured.map(level => ({ ...level, color: fallbackLevels.find(item => item.id === level.id)?.color || level.color }));
}
function renderLevelTrack() {
  const current = levels().findIndex(level => level.id === state.account?.tier);
  for (const id of ['dashboard-level-track', 'account-level-track', 'level-view-track']) {
    const track = $(`#${id}`); if (!track) continue;
    track.replaceChildren(...levels().map((level, index) => {
      const item = document.createElement('div');
      item.className = `track-step ${index < current ? 'completed' : index === current ? 'current' : 'future'}`;
      item.style.setProperty('--track-color', level.color || '#B2BDD0');
      item.setAttribute('aria-current', index === current ? 'step' : 'false');
      const dot = document.createElement('span'); dot.className = 'track-dot'; dot.textContent = index < current ? '✓' : String(index + 1);
      const label = document.createElement('strong'); label.textContent = level.id;
      item.append(dot, label); return item;
    }));
    track.setAttribute('aria-label', t("d.0", state.account?.tier || 'BASE'));
  }
}
function renderLevels() {
  const cards = levels().map(level => {
    const card = document.createElement('article');
    card.className = 'level-card'; card.dataset.tier = level.id;
    card.style.setProperty('--level-color', level.color || '#B2BDD0');
    const title = document.createElement('h3'); title.textContent = level.id;
    const info = document.createElement('button'); info.type = 'button'; info.className = 'level-info';
    info.dataset.levelInfo = level.id; info.setAttribute('aria-label', t("d.1", level.id)); info.textContent = 'i';
    const depositLabel = uiNode('span', t('still.deposit'), 'level-deposit-label');
    const price = document.createElement('strong'); price.className = 'level-price'; price.textContent = money(level.minDeposit);
    const signals = document.createElement('strong'); signals.className = 'level-signals';
    signals.textContent = level.signalLimit === null ? t("d.3") : t("d.6", level.signalLimit, level.signalLimit === 3 ? t("d.4") : t("d.5"));
    const extra = document.createElement('div'); extra.className = 'level-extra';
    const modes = level.availableAiModes.map(mode => `${mode.toUpperCase()} AI`).join(' · ');
    extra.textContent = `${level.creditsLimit.toLocaleString('en-US')} AI Credits`;
    const abilities = document.createElement('div'); abilities.className = 'level-modes'; abilities.textContent = modes;
    const detail = document.createElement('small'); detail.className = 'level-detail';
    detail.textContent = level.id === 'ULTRA' ? t("d.7") : level.id === 'ADVANCED' ? t("d.8") : level.id === 'PRO' ? t("d.9") : level.id === 'PLUS' ? t("h.187") : t("d.10");
    const features = uiNode('div', '', 'level-features'); features.setAttribute('aria-label', t('still.features')); features.append(signals, extra, abilities);
    const action = uiNode('button', t('still.choose', level.id), 'button secondary level-choose'); action.type = 'button'; action.dataset.levelChoose = level.id;
    const detailButton = uiNode('button', t('still.details'), 'text-link level-details-link'); detailButton.type = 'button'; detailButton.dataset.levelInfo = level.id;
    card.append(title, info, detail, depositLabel, price, features, action, detailButton); return card;
  });
  $('#public-level-cards').replaceChildren(...cards);
  $('#activation-levels').replaceChildren(...cards.map(card => card.cloneNode(true)));
  const costs = state.config?.aiModes || { Fast: { cost: 10 }, Deep: { cost: 100 }, Maximum: { cost: 500 } };
  $('#faq-credits').textContent = t('d.15', costs.Fast.cost, costs.Deep.cost, costs.Maximum.cost);
}
function openLevelDetails(id) {
  const list = levels();
  const index = list.findIndex(level => level.id === id);
  if (index < 0) return;
  const level = list[index];
  const previous = list[index - 1];
  const purpose = {
    BASE: t("d.16"),
    PLUS: t("d.17"),
    PRO: t("d.18"),
    ADVANCED: t("d.19"),
    ULTRA: t("d.20"),
  }[id];
  const details = [
    [t("d.21"), money(level.minDeposit)],
    [t("d.22"), level.signalLimit === null ? t("d.3") : String(level.signalLimit)],
    [t("d.23"), level.creditsLimit.toLocaleString('en-US')],
    [t("d.24"), level.availableAiModes.map(mode => `${mode.toUpperCase()} AI`).join(' · ')],
    [t("d.25"), previous ? `${level.signalLimit === null ? t("d.26") : t("d.27", level.signalLimit - previous.signalLimit)}, +${(level.creditsLimit - previous.creditsLimit).toLocaleString('en-US')} AI Credits${level.availableAiModes.length > previous.availableAiModes.length ? t("d.28") : ''}` : t("d.29")],
  ];
  $('#level-title').textContent = id;
  const box = $('#level-details'); box.replaceChildren();
  const listNode = uiNode('dl', '', 'level-detail-list');
  for (const [label, value] of details) {
    const row = uiNode('div'); row.append(uiNode('dt', label), uiNode('dd', value)); listNode.append(row);
  }
  box.append(uiNode('p', purpose, 'level-purpose'), listNode);
  $('#level-dialog').style.setProperty('--level-color', fallbackLevels.find(item => item.id === id)?.color || '#B2BDD0');
  $('#level-dialog').showModal();
}
function updateActivation() {
  const note = $('#deposit-message');
  setActivationMessage(note.dataset.messageKey || 'h.112', note.classList.contains('error'));
}
function setActivationMessage(key, isError = false) {
  const note = $('#deposit-message');
  note.dataset.messageKey = key;
  note.classList.toggle('error', isError);
  note.setAttribute('role', isError ? 'alert' : 'status');
  note.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  note.textContent = t(key);
}

const siteRoot = new URL('/', window.location.origin);
const routes = { landing: '/', login: '/login/', register: '/register/', access: '/verify/', 'password-setup': '/password-setup/', deposit: '/deposit/', dashboard: '/app/', history: '/history/', level: '/level/', account: '/account/', settings: '/settings/', 'owner-stats-view': '/owner/' };
function routePath(view, recordId) { return view === 'history-detail' ? `/history/${encodeURIComponent(recordId)}/` : routes[view] || '/'; }
function locationView() {
  const path = window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
  const detail = /^\/history\/([a-f0-9-]{36})$/.exec(path);
  if (detail) return { view: 'history-detail', recordId: detail[1] };
  return { view: Object.keys(routes).find(name => routes[name].replace(/\/$/, '') === path) || 'landing' };
}
function isOwner() { return ['admin', 'owner'].includes(state.role); }
function money(cents) { return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`; }
function updateCycleTime() {
  const account = state.account;
  if (!account || state.status !== 'active') return;
  const reset = account.cycleResetAt;
  if (!reset || reset <= Date.now() - state.clockOffset) {
    $('#status-reset').textContent = t("d.32");
    return;
  }
  const minutes = Math.ceil((reset - (Date.now() - state.clockOffset)) / 60000);
  $('#status-reset').textContent = t("d.33", Math.floor(minutes / 60), minutes % 60);
}
function updateTerminalAccount() {
  const a = state.account;
  if (!a || a.status !== 'active') return;
  const rank = state.config?.levels?.findIndex(level => level.id === a.tier) + 1;
  const tint = fallbackLevels.find(level => level.id === a.tier)?.color || '#B2BDD0';
  $('#account-widget').style.setProperty('--tier-color', tint);
  $('#summary-tier').textContent = a.tier || 'BASE';
  $('#summary-credits').textContent = a.creditsTotal === null ? t("d.34") : `${a.creditsRemaining} AI Credits`;
  $('#summary-signals').textContent = a.signalLimit === null ? t("d.35") : t("d.36", a.signalsUsed || 0, a.signalLimit);
  $('#summary-next').textContent = a.nextLevel && !isOwner() ? t("d.37", a.nextLevel, money(Math.max(0, a.nextLevelDepositCents - a.depositCents))) : '';
  $('#status-tier').textContent = a.tier || t("d.38");
  $('#status-rank').textContent = isOwner() ? t("h.10") : t("d.39", rank || 1);
  $('#status-modes').textContent = t("d.40", (a.modes || []).map(mode => `${mode.toUpperCase()} AI`).join(' · ') || 'FAST AI');
  renderLevelTrack();
  $('#status-deposits').textContent = isOwner() ? t("d.41") : money(a.depositCents);
  $('#status-credits').textContent = a.creditsTotal === null ? t("d.3") : `${a.creditsRemaining} / ${a.creditsTotal}`;
  $('#status-signals').textContent = `${a.signalsUsed || 0} / ${a.signalLimit === null ? '∞' : a.signalLimit}`;
  $('#status-next').classList.toggle('hidden', !a.nextLevel || isOwner());
  $('#status-max').classList.toggle('hidden', Boolean(a.nextLevel) || isOwner());
  $('#status-cycle-note').classList.toggle('hidden', Boolean(a.cycleResetAt));
  if (a.nextLevel) {
    $('#status-next-text').textContent = t("d.37", a.nextLevel, money(Math.max(0, a.nextLevelDepositCents - a.depositCents)));
    const current = state.config?.levels?.find(level => level.id === a.tier)?.minDeposit || 0;
    $('#status-progress').value = Math.min(100, 100 * Math.max(0, (a.depositCents - current) / (a.nextLevelDepositCents - current)));
  }
  if (!a.nextLevel && !isOwner()) $('#status-reset').title = t("h.18");
  $('#status-upgrade').classList.toggle('hidden', !a.nextLevel || isOwner());
  $('#dashboard-upgrade').classList.toggle('hidden', !a.nextLevel || isOwner());
  updateCycleTime();
  updateModes();
}
function openUpgrade() {
  const a = state.account;
  if (!a || isOwner() || a.tier === 'ULTRA') return;
  const current = levels().find(level => level.id === a.tier);
  const next = levels().find(level => level.id === a.nextLevel);
  if (!next || !current) return;
  const box = $('#upgrade-content'); box.replaceChildren();
  const difference = uiNode('div', '', 'upgrade-difference');
  difference.append(uiNode('span', t("d.31", next.id)), uiNode('strong', money(Math.max(0, next.minDeposit - a.depositCents))));
  box.append(difference);
  const label = uiNode('p', `${money(a.depositCents)} / ${money(next.minDeposit)}`, 'upgrade-progress-label'); box.append(label);
  const progress = document.createElement('progress'); progress.max = next.minDeposit; progress.value = a.depositCents; box.append(progress);
  const comparison = uiNode('div', '', 'upgrade-comparison');
  for (const [heading, tier] of [[t("d.42"), current], [t("d.43"), next]]) {
    const group = uiNode('div', '', 'upgrade-column');
    group.append(uiNode('span', heading), uiNode('strong', tier.id),
      uiNode('p', `${tier.signalLimit === null ? t("d.26") : t("d.44", tier.signalLimit)}`),
      uiNode('p', `${tier.creditsLimit} AI Credits`),
      uiNode('small', tier.availableAiModes.map(mode => `${mode.toUpperCase()} AI`).join(' · ')));
    comparison.append(group);
  }
  box.append(comparison);
  const benefits = uiNode('div', '', 'upgrade-gain'); benefits.append(uiNode('span', t("d.45")));
  benefits.append(uiNode('strong', next.signalLimit === null ? t("d.26") : t("d.46", next.signalLimit - current.signalLimit)));
  benefits.append(uiNode('strong', `+${next.creditsLimit - current.creditsLimit} AI Credits`));
  for (const mode of next.availableAiModes.filter(mode => !current.availableAiModes.includes(mode))) benefits.append(uiNode('strong', `+ ${mode.toUpperCase()} AI`));
  if (next.id === 'ULTRA') benefits.append(uiNode('small', t("d.47")));
  box.append(benefits);
  const link = document.createElement('a'); link.className = 'button primary'; link.textContent = t("d.48", next.id);
  link.href = `${apiBase}/go`; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
  const all = uiNode('button', t("d.49"), 'text-link'); all.type = 'button'; all.addEventListener('click', () => {
    if (box.querySelector('.upgrade-all-levels')) return box.querySelector('.upgrade-all-levels').remove();
    const list = uiNode('div', '', 'upgrade-all-levels');
    levels().forEach(level => list.append(uiNode('p', t("d.50", level.id, money(level.minDeposit), level.signalLimit ?? '∞', level.creditsLimit))));
    box.append(list);
  }); box.append(all);
  $('#upgrade-dialog').showModal();
}
function updateAccountPage() {
  const a = state.account;
  if (!a || a.status !== 'active') return;
  const level = levels().find(item => item.id === a.tier);
  const tint = level?.color || '#B2BDD0';
  $('#account-level-name').textContent = a.tier || t("d.38");
  $('#account-level-name').style.color = tint;
  $('#account-level-rank').textContent = isOwner() ? t("h.10") : t("d.39", levels().findIndex(item => item.id === a.tier) + 1);
  $('#account-id-value').textContent = a.accountId || t("d.51");
  $('#account-verified').textContent = a.verifiedAt ? t("d.52") : t("d.53");
  $('#account-registered').textContent = a.registeredAt ? new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(a.registeredAt)) : t("d.54");
  $('#account-total-deposits').textContent = money(a.depositCents);
  $('#account-credits').textContent = a.creditsTotal === null ? t("d.3") : `${a.creditsRemaining} / ${a.creditsTotal}`;
  $('#account-signals').textContent = `${a.signalsUsed || 0} / ${a.signalLimit === null ? '∞' : a.signalLimit}`;
  const next = levels().find(item => item.id === a.nextLevel);
  $('#account-level-progress').classList.toggle('hidden', !next || isOwner());
  $('#account-max').classList.toggle('hidden', Boolean(next) || isOwner());
  $('#account-upgrade').classList.toggle('hidden', !next || isOwner());
  if (next) {
    $('#account-deposits').textContent = money(a.depositCents);
    $('#account-next').textContent = next.id;
    $('#account-next').style.color = next.color;
    $('#account-progress-from').textContent = money(a.depositCents);
    $('#account-progress-to').textContent = `${money(next.minDeposit)} ${next.id}`;
    $('#account-progress').max = next.minDeposit;
    $('#account-progress').value = a.depositCents;
    $('#account-next-label').textContent = next.id;
    $('#account-remaining').textContent = money(Math.max(0, next.minDeposit - a.depositCents));
  }
  $('#owner-migration').classList.toggle('hidden', a.role !== 'admin');
  $('#change-password-open').classList.toggle('hidden', a.role === 'admin');
  $('#logout-all').classList.toggle('hidden', a.role === 'admin');
  $('#security-message').textContent = a.mustChangePassword ? t("d.55") : '';
}
function updateModes() {
  const allowed = state.account?.modes || [];
  if (!allowed.includes(state.mode)) state.mode = 'Fast';
  for (const card of $('#mode-options').querySelectorAll('[data-mode]')) {
    const unlocked = allowed.includes(card.dataset.mode);
    const cost = state.config?.aiModes?.[card.dataset.mode]?.cost;
    if (cost) card.querySelectorAll('span')[1].textContent = `${cost} AI Credits`;
    card.classList.toggle('locked', !unlocked);
    card.classList.toggle('selected', state.mode === card.dataset.mode);
    card.setAttribute('aria-pressed', String(state.mode === card.dataset.mode));
    card.setAttribute('aria-disabled', String(!unlocked));
    card.querySelector('.mode-lock').classList.toggle('hidden', unlocked);
  }
  $('#mode-select').firstChild.textContent = `${state.mode.toUpperCase()} AI · ${state.config?.aiModes?.[state.mode]?.cost || { Fast: 10, Deep: 100, Maximum: 500 }[state.mode]} AI Credits `;
}
function modeDetails() { return {
  Fast: { power: 30, intro: t("d.56"), points: [t("d.57"), t("d.58"), t("d.59"), t("d.60")] },
  Deep: { power: 70, intro: t("d.61"), points: [t("d.57"), t("h.225"), t("d.62"), t("d.63"), 'Momentum', t("d.59"), t("d.64")] },
  Maximum: { power: 100, intro: t("d.65"), points: [t("d.57"), t("h.225"), t("d.62"), t("d.63"), 'Momentum', t("d.59"), t("d.66"), t("d.67"), t("d.68"), t("d.69"), t("d.70"), t("d.71")] },
}; }
function showModeDetails(mode) {
  const details = modeDetails()[mode]; if (!details) return;
  $('#mode-title').textContent = `${mode.toUpperCase()} AI`;
  const box = $('#mode-details'); box.replaceChildren();
  box.append(uiNode('p', details.intro));
  const meter = uiNode('div', '', 'analysis-power');
  meter.append(uiNode('span', t("h.210")), uiNode('strong', `${details.power}%`));
  const track = uiNode('div', '', 'power-track'), fill = uiNode('i'); fill.style.width = `${details.power}%`; track.append(fill); meter.append(track); box.append(meter);
  const list = uiNode('ul'); details.points.forEach(point => list.append(uiNode('li', point))); box.append(list);
  box.append(uiNode('p', t("d.72")));
  $('#mode-dialog').showModal();
}

function disableRegistration() {
  for (const link of document.querySelectorAll('[data-registration-link]')) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.title = t("d.73");
  }
}

function moscow(date = new Date(), withSeconds = false) {
  return new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) }).format(date);
}
function show(view, historyMode = 'replace', recordId = null) {
  const visibleView = view === 'history-detail' ? 'history' : view;
  const url = routePath(view, recordId);
  if (historyMode === 'push' && window.location.pathname !== url) window.history.pushState(null, '', url);
  else if (historyMode === 'replace' && window.location.pathname !== url) window.history.replaceState(null, '', url);
  for (const name of views) $(`#${name}`)?.classList.toggle('hidden', name !== visibleView);
  document.body.dataset.view = visibleView;
  document.body.dataset.auth = state.status === 'active' ? 'active' : 'public';
  document.body.dataset.owner = String(isOwner());
  $('#auth-loading')?.classList.add('hidden');
  $('#global-message').classList.add('hidden');
  if (!['history', 'history-detail'].includes(view)) window.scrollTo({ top: 0, behavior: 'instant' });
  if (state.polling) { clearInterval(state.polling); state.polling = null; }
  if (view === 'deposit') state.polling = setInterval(() => refreshSession(false), 10_000);
  $('#owner-stats-link').classList.toggle('hidden', !isOwner() || view === 'owner-stats-view');
  $('#menu-terminal').classList.toggle('hidden', state.status !== 'active' || view === 'dashboard');
  $('#menu-account').classList.toggle('hidden', state.status !== 'active' || view === 'account');
  $('#menu-settings').classList.toggle('hidden', state.status !== 'active' || view === 'settings');
  $('#menu-login').classList.toggle('hidden', state.status === 'active');
  $('#menu-logout').classList.toggle('hidden', state.status === 'guest');
  $('#upgrade-link').classList.toggle('hidden', !['dashboard', 'account', 'level'].includes(view) || isOwner() || state.account?.tier === 'ULTRA');
  $('#header-upgrade')?.classList.toggle('hidden', state.status !== 'active' || isOwner() || state.account?.tier === 'ULTRA');
  $('#header-account')?.classList.toggle('hidden', state.status !== 'active');
  $('#header-owner')?.classList.toggle('hidden', !isOwner());
  $('#account-widget').classList.toggle('hidden', state.status !== 'active');
  $('#account-chip').classList.add('hidden');
  $('#site-menu').classList.add('hidden');
  $('#site-menu-toggle').setAttribute('aria-expanded', 'false');
  for (const item of document.querySelectorAll('[data-route]')) {
    const active = item.dataset.route === visibleView;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  }
  $('#view-title').textContent = { dashboard: t("h.5"), history: t("h.6"), level: t("h.7"), account: t("h.8"), settings: t("h.9"), 'owner-stats-view': t("h.10") }[visibleView] || '';
  if (view === 'owner-stats-view' && isOwner()) { refreshOwnerStats(); refreshOwnerUsers(false); }
  if (view === 'dashboard') updateTerminalAccount();
  if (view === 'account') { updateAccountPage(); renderLevelTrack(); }
  if (view === 'level') updateLevelPage();
  if (view === 'history' || view === 'history-detail') {
    if (!state.historyItems.length) loadHistory(false);
    else renderHistory();
    if (view === 'history-detail') openHistoryDetail(recordId);
    else closeHistoryDetail();
  }
  if (view === 'password-setup') $('#setup-account-id').textContent = state.accountId || '';
  if (view === 'deposit') updateActivation();
}
function navigate(view, recordId = null) { show(view, 'push', recordId); }
function routeFromStatus(historyMode = 'replace') {
  const { view, recordId } = locationView();
  if (state.status === 'loading') return;
  if (state.status !== 'guest' && state.role !== 'admin' && state.account?.passwordConfigured === false)
    return show('password-setup', historyMode);
  if (state.account?.mustChangePassword) return show('account', historyMode);
  if (state.status === 'active') {
    if (view === 'owner-stats-view' && !isOwner()) return show('dashboard', historyMode);
    if (['landing', 'login', 'register', 'access', 'password-setup', 'deposit'].includes(view)) return show('dashboard', historyMode);
    return show(view, historyMode, recordId);
  }
  if (state.status === 'deposit') {
    return show(['deposit', 'access'].includes(view) ? view : 'deposit', historyMode);
  }
  return show(['landing', 'login', 'register', 'access'].includes(view) ? view : 'login', historyMode);
}
window.addEventListener('popstate', () => {
  routeFromStatus('replace');
  if (window.location.hash) requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
});
async function api(url, options = {}) {
  if (staticPreview) throw new Error(t("d.74"));
  let response;
  try {
    response = await fetch(`${apiBase}${url}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  } catch {
    throw Object.assign(new Error(t("d.75")), { code: 'NETWORK_ERROR' });
  }
  const data = await response.json().catch(() => {
    throw Object.assign(new Error(response.status === 413 ? t("d.76") : t("d.77")), { code: 'INVALID_SERVER_RESPONSE', status: response.status });
  });
  if (!response.ok) throw Object.assign(new Error(window.BluFinI18n.language === 'en' ? (window.BLUFIN_MESSAGES.en['e.' + data.code] || t('d.78')) : (data.message || t('d.78'))), { code: data.code, status: response.status });
  return data;
}
async function refreshOwnerStats() {
  try {
    const stats = await api('/api/admin/stats');
    for (const field of ['accounts', 'active', 'registrations', 'deposits', 'analyses']) {
      $(`#owner-${field}`).textContent = new Intl.NumberFormat(locale()).format(stats[field]);
    }
    $('#owner-stats-message').textContent = t("d.79", moscow(new Date(), true));
  } catch { $('#owner-stats-message').textContent = t("d.80"); }
}
function uiNode(tag, value = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function dateLabel(timestamp) {
  if (!timestamp) return t("d.54");
  const date = new Date(timestamp);
  const today = new Date(Date.now() - state.clockOffset);
  if (date.toDateString() === today.toDateString()) return t("d.81", moscow(date));
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return t("d.82", moscow(date));
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function tierBadge(tier) {
  const badge = uiNode('span', tier || t("h.168"), 'tier-badge');
  badge.style.setProperty('--tier-color', fallbackLevels.find(level => level.id === tier)?.color || '#B2BDD0');
  return badge;
}
async function refreshOwnerUsers(more = false) {
  if (!isOwner()) return;
  const page = more ? state.ownerPage + 1 : 0;
  const search = $('#owner-search').value.trim();
  if (search && !/^\d{1,16}$/.test(search)) { $('#owner-users-message').textContent = t("d.83"); return; }
  $('#owner-users-message').textContent = t("d.84");
  try {
    const data = await api(`/api/admin/users?q=${encodeURIComponent(search)}&filter=${state.ownerFilter}&page=${page}`);
    state.ownerPage = page;
    if (!more) $('#owner-users-body').replaceChildren();
    for (const user of data.users) {
      const row = document.createElement('tr'); row.tabIndex = 0; row.dataset.accountId = user.accountId;
      const values = [user.accountId, null, money(user.depositCents),
        user.creditsTotal === null ? t("d.3") : `${user.creditsRemaining} / ${user.creditsTotal}`,
        `${user.signalsUsed} / ${user.signalLimit === null ? '∞' : user.signalLimit}`,
        ['Fast', 'Deep', 'Maximum'].map(mode => `${user.aiUsage?.[mode]?.cycle || 0} ${mode}`).join(' · '),
        dateLabel(user.lastActiveAt), user.status === 'active' ? t("d.85") : t("h.168")];
      const labels = ['ID', t("h.7"), t("h.160"), 'AI Credits', t("h.15"), 'AI Usage', t("h.169"), t("h.123")];
      values.forEach((value, index) => {
        const cell = document.createElement('td'); cell.dataset.label = labels[index];
        cell.append(index === 1 ? tierBadge(user.tier) : document.createTextNode(value)); row.append(cell);
      });
      const actions = document.createElement('td'); actions.dataset.label = t("h.170");
      const reset = uiNode('button', t("d.86"), 'owner-row-reset');
      reset.type = 'button'; reset.dataset.resetPassword = user.accountId;
      reset.setAttribute('aria-label', t("d.87", user.accountId));
      actions.append(reset);
      row.append(actions);
      $('#owner-users-body').append(row);
    }
    $('#owner-more').classList.toggle('hidden', !data.hasMore);
    $('#owner-users-message').textContent = data.users.length ? '' : more ? t("d.88") : t("d.89");
  } catch (error) { $('#owner-users-message').textContent = t("d.90", error.message); }
}
function ownerDetailRow(label, value) {
  const item = uiNode('div'); item.append(uiNode('span', label), uiNode('strong', value)); return item;
}
function renderOwnerUser(data, appendSignals = false) {
  const user = data.user;
  state.ownerUserId = user.accountId;
  $('#owner-user-title').textContent = t("d.91", user.accountId);
  const box = $('#owner-user-content');
  if (!appendSignals) {
    box.replaceChildren();
    const fields = uiNode('div', '', 'owner-detail-grid');
    [
      [t("h.123"), user.status === 'active' ? t("d.85") : t("h.168")],
      [t("h.113"), user.tier || t("d.30")],
      [t("h.75"), dateLabel(user.registeredAt)], [t("d.92"), dateLabel(user.verifiedAt)],
      [t("h.14"), money(user.depositCents)],
      ['AI Credits', user.creditsTotal === null ? t("d.3") : `${user.creditsRemaining} / ${user.creditsTotal}`],
      [t("d.93"), `${user.creditsSpent || 0}`],
      [t("h.15"), `${user.signalsUsed} / ${user.signalLimit === null ? '∞' : user.signalLimit}`],
      [t("d.94"), dateLabel(user.cycleStartedAt)], [t("h.16"), dateLabel(user.cycleResetAt)],
      [t("h.169"), dateLabel(user.lastActiveAt)],
      [t("h.114"), user.nextLevel || t("h.18")],
    ].forEach(([label, value]) => fields.append(ownerDetailRow(label, value)));
    box.append(fields);
    if (user.nextLevel) {
      box.append(uiNode('p', t("d.95", user.nextLevel, money(Math.max(0, user.nextLevelDepositCents - user.depositCents)), money(user.depositCents), money(user.nextLevelDepositCents))));
      const progress = document.createElement('progress'); progress.max = user.nextLevelDepositCents; progress.value = user.depositCents; box.append(progress);
    }
    const refresh = uiNode('button', t("d.96"), 'button secondary');
    refresh.id = 'owner-user-refresh'; refresh.type = 'button'; box.append(refresh);
    const reset = uiNode('form', '', 'owner-password-reset'); reset.id = 'owner-password-reset';
    reset.append(uiNode('h3', t("d.97")));
    const label = uiNode('label', t("d.98")); label.htmlFor = 'owner-temporary-password';
    const input = document.createElement('input'); input.id = 'owner-temporary-password'; input.type = 'password'; input.minLength = 10; input.required = true; input.autocomplete = 'new-password';
    const submit = uiNode('button', t("d.86"), 'button secondary'); submit.type = 'submit';
    const note = uiNode('p', t("d.99"), 'fine-print'); note.id = 'owner-reset-message';
    reset.append(label, input, submit, note); box.append(reset);
    box.append(uiNode('h3', t("d.100")));
    const deposits = uiNode('ul', '', 'owner-detail-list');
    for (const item of data.deposits) { const li = uiNode('li'); li.append(uiNode('span', dateLabel(item.confirmedAt)), uiNode('span', `${money(item.amountCents)} · Confirmed`)); deposits.append(li); }
    if (!data.deposits.length) deposits.append(uiNode('li', t("d.101")));
    box.append(deposits);
    box.append(uiNode('h3', t("d.102")));
    const usage = uiNode('ul', '', 'owner-detail-list');
    for (const mode of ['Fast', 'Deep', 'Maximum']) { const li = uiNode('li'); li.append(uiNode('span', mode), uiNode('span', `${data.aiUsage?.[mode]?.cycle || 0} / ${data.aiUsage?.[mode]?.lifetime || 0}`)); usage.append(li); }
    box.append(usage, uiNode('h3', t("d.103")));
    box.append(uiNode('ul', '', 'owner-detail-list')); box.lastElementChild.id = 'owner-signals-list';
  }
  const list = $('#owner-signals-list');
  if (!appendSignals && !data.signals.length) list.append(uiNode('li', t("d.104")));
  for (const signal of data.signals) {
    const li = uiNode('li');
    const direction = { UP: t("h.216"), DOWN: t("d.105") }[signal.verdict] || signal.verdict;
    li.append(uiNode('span', `${signal.pair} · ${(signal.mode || 'Fast').toUpperCase()} · ${direction}`),
      uiNode('span', `${dateLabel(signal.createdAt)} · ${signal.expiresAt && signal.expiresAt > Date.now() - state.clockOffset ? t("d.85") : t("d.106")}`));
    list.append(li);
  }
  $('#owner-more-signals')?.remove();
  if (data.hasMoreSignals) { const more = uiNode('button', t("d.107"), 'button secondary'); more.id = 'owner-more-signals'; more.dataset.page = String(data.signalPage + 1); box.append(more); }
}
async function openOwnerUser(accountId) {
  if (!isOwner()) return;
  $('#owner-user-content').textContent = t("d.108");
  $('#owner-user-dialog').showModal();
  try { renderOwnerUser(await api(`/api/admin/users/${encodeURIComponent(accountId)}`)); }
  catch (error) { $('#owner-user-content').textContent = error.message; }
}
async function enterOwnerCode(code) {
  const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ code }) });
  state.token = null; removeSession(); state.status = 'active'; state.role = 'admin'; state.accountId = null;
  state.account = { status: 'active', role: 'admin', tier: 'ULTRA', modes: ['Fast', 'Deep', 'Maximum'] }; state.latestResult = null;
  $('#account-id').value = '';
  await refreshSession(false);
  routeFromStatus();
}
// Keep the owner sign-in usable even while the public configuration request is pending.
$('#owner-code-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const messageBox = $('#owner-code-message');
  button.disabled = true;
  messageBox.classList.add('hidden');
  try {
    await enterOwnerCode($('#owner-code').value.trim());
    form.reset();
  } catch (error) {
    message(messageBox, error.message);
  } finally {
    button.disabled = false;
  }
});
function acceptAuth(result) {
  state.token = null;
  removeSession();
  state.status = result.status;
  state.role = result.role || 'user';
  state.accountId = result.accountId || null;
  state.account = result;
  window.BluFinI18n.useAccount(result.language);
  state.latestResult = null;
  if (result.passwordConfigured === false && result.role !== 'admin') navigate('password-setup');
  else routeFromStatus();
}
function clearAuth() {
  state.token = null; state.status = 'guest'; state.role = null; state.accountId = null; state.account = null;
  removeSession();
  state.latestResult = null; if (state.resultTimer) clearInterval(state.resultTimer);
  state.resultTimer = null; showTerminal('empty');
  state.historyItems = [];
  show('landing', 'replace');
}
async function refreshSession(navigate = true, preserveHistory = false) {
  try {
    const account = await api('/api/me');
    if (account.status === 'guest') { state.token = null; removeSession(); }
    const changed = account.status !== state.status;
    state.status = account.status;
    state.accountId = account.accountId || null;
    state.role = account.role || null; state.account = account;
    window.BluFinI18n.useAccount(account.language);
    if (account.serverTime) state.clockOffset = Date.now() - account.serverTime;
    if (account.status === 'active') updateTerminalAccount();
    if (navigate && changed) routeFromStatus();
    if (!navigate && changed && !preserveHistory && ['active', 'guest'].includes(account.status)) routeFromStatus();
    if (account.status === 'deposit') updateActivation();
    return account;
  } catch {
    if (!navigate && state.status === 'deposit') setActivationMessage('d.109', true);
    return null;
  }
}
function message(node, text, isError = true) {
  if (node.id === 'analysis-error') node.classList.remove('analysis-error-card');
  node.classList.remove('hidden');
  node.style.color = isError ? '' : '#a6eeda';
  node.style.background = isError ? '' : '#163a3c';
  node.style.borderColor = isError ? '' : '#2f746b';
  node.textContent = text;
}
async function logoutCurrent() {
  try {
    if (!staticPreview) await api('/api/auth/logout', { method: 'POST' });
    clearAuth();
  } catch (error) {
    $('#global-message').textContent = t("d.110", error.message);
    $('#global-message').classList.remove('hidden');
  }
}
function showAnalysisError(error) {
  const screenshotIssue = ['SCREENSHOT_INCOMPLETE', 'INVALID_IMAGE', 'IMAGE_DECODE_FAILED'].includes(error.code);
  const box = $('#analysis-error');
  box.classList.add('analysis-error-card');
  box.classList.remove('hidden');
  box.replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = screenshotIssue ? t("d.111") : t("d.112");
  const description = document.createElement('span');
  description.textContent = screenshotIssue
    ? (error.message || t("d.113"))
    : error.code === 'AI_INVALID_RESPONSE'
      ? t("d.114")
      : (error.message || t("d.115"));
  const action = document.createElement('button');
  action.type = 'button'; action.className = 'button secondary';
  action.textContent = screenshotIssue ? t("h.181") : t("d.116");
  action.addEventListener('click', () => {
    if (screenshotIssue) { $('#chart-file').value = ''; $('#chart-file').click(); }
    else $('#analysis-form').requestSubmit();
  });
  box.append(heading, description, action);
}
function setFile(file) {
  if (!file) return;
  const mime = file.type.toLowerCase();
  if (!mime.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
    return message($('#analysis-error'), t("d.117"));
  if (file.size > 50_000_000) return message($('#analysis-error'), t("d.118"));
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = file;
  state.previewUrl = URL.createObjectURL(file);
  $('#preview-img').src = state.previewUrl;
  $('#preview-name').textContent = file.name;
  $('#image-preview').classList.remove('hidden');
  $('#empty-upload').classList.add('hidden');
  $('#analysis-error').classList.add('hidden');
  $('#dashboard').classList.add('has-file');
}
async function imageDataUrl(file) {
  const heic = /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf](?:-sequence)?$/i.test(file.type);
  let source = file;
  if (heic) {
    try {
      const { heicTo } = await import('./heic-to.min.js');
      source = await heicTo({ blob: file, type: 'image/jpeg', quality: .96 });
    } catch { throw Object.assign(new Error(t("d.119")), { code: 'IMAGE_DECODE_FAILED' }); }
  }
  let image;
  let objectUrl;
  try {
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(source);
  } catch { /* Safari can reject a valid photo here. Try the image element below. */ }
  if (!image) {
    objectUrl = URL.createObjectURL(source);
    image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = reject;
    });
    image.src = objectUrl;
    try { await loaded; }
    catch { URL.revokeObjectURL(objectUrl); throw Object.assign(new Error(t("d.120")), { code: 'IMAGE_DECODE_FAILED' }); }
  }
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw Object.assign(new Error(t("d.121")), { code: 'IMAGE_DECODE_FAILED' });
    const scale = Math.min(1, 3200 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    const maxLength = 15_900_000; // Leave room for the small history preview in the JSON request.
    for (const ratio of [1, .9, .8, .7, .6]) {
      canvas.width = Math.max(1, Math.round(width * scale * ratio));
      canvas.height = Math.max(1, Math.round(height * scale * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw Object.assign(new Error(t("d.122")), { code: 'IMAGE_DECODE_FAILED' });
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (file.type === 'image/png' || /\.png$/i.test(file.name)) {
        const png = canvas.toDataURL('image/png');
        if (png.length <= maxLength) return png;
      }
      for (const quality of [.94, .86, .76]) {
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        if (jpeg.startsWith('data:image/jpeg;') && jpeg.length <= maxLength) return jpeg;
      }
    }
    throw Object.assign(new Error(t("d.123")), { code: 'IMAGE_DECODE_FAILED' });
  } finally {
    if (typeof image.close === 'function') image.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
function showTerminal(section) {
  for (const [name, id] of Object.entries({ empty: 'terminal-empty', processing: 'terminal-processing', result: 'terminal-result' }))
    $(`#${id}`).classList.toggle('hidden', name !== section);
  $('#dashboard').dataset.analysisState = section;
  window.dispatchEvent(new CustomEvent('blufin:analysis-state', { detail: section }));
}
function beginProcessing(mode) {
  const steps = {
    Fast: [t("d.124"), t("d.125"), t("d.126"), t("d.127")],
    Deep: [t("d.124"), t("d.128"), t("d.129"), t("d.130"), t("d.131"), t("d.132")],
    Maximum: [t("d.124"), t("d.128"), t("d.133"), t("d.130"), t("d.134"), t("d.135"), t("d.136")],
  }[mode];
  $('#processing-mode').textContent = `${mode.toUpperCase()} AI ACTIVE`;
  $('#processing-power').textContent = `${modeDetails()[mode].power}%`;
  $('#processing-power-fill').style.width = `${modeDetails()[mode].power}%`;
  $('#processing-steps').replaceChildren();
  steps.forEach((label, index) => {
    const item = document.createElement('li');
    item.textContent = label;
    if (index === 0) item.classList.add('current');
    $('#processing-steps').append(item);
  });
  showTerminal('processing');
}
function imagePrepared() {
  const items = $('#processing-steps').children;
  items[0]?.classList.replace('current', 'done');
  items[1]?.classList.add('current');
}
function renderResult(data, scroll = false) {
  if (!['UP', 'DOWN'].includes(data?.result?.verdict)) throw new Error(t("d.137"));
  if (data.serverTime) state.clockOffset = Date.now() - data.serverTime;
  state.latestResult = { ...data, serverTime: undefined };
  state.dismissedResultId = null;
  const r = data.result;
  const actionable = Boolean(data.signalExpiresAt);
  const panel = $('#terminal-result');
  const preview = data.preview || (state.file && state.previewUrl) || null;
  $('#result-preview-open').classList.toggle('hidden', !preview);
  if (preview) $('#result-preview').src = preview;

  panel.classList.remove('expired');
  const direction = $('#signal-hero');
  direction.classList.toggle('direction-up', r.verdict === 'UP');
  direction.classList.toggle('direction-down', r.verdict === 'DOWN');

  $('#signal-actions').classList.remove('hidden');
  $('#signal-analysis').classList.add('hidden');
  $('#toggle-analysis').textContent = t("h.223");
  $('#toggle-analysis').setAttribute('aria-expanded', 'false');
  $('#signal-timer').classList.toggle('hidden', !actionable);
  $('#signal-status').textContent = t("h.214");
  $('#signal-stamp').textContent = t("d.138", moscow(new Date(data.created_at), true));
  for (const [id, value] of Object.entries({
    pair: r.pair || data.asset, timeframe: r.timeframe || t("d.139"),
    price: r.current_price || t("d.140"),
    direction: { UP: t("h.216"), DOWN: t("d.105") }[r.verdict],
    duration: t("d.141", data.signalDuration / 60),
    mode: (data.mode || 'Fast').toUpperCase(),
  })) $(`#signal-${id}`).textContent = value;
  for (const field of ['trend', 'structure', 'momentum', 'volatility', 'historical_match', 'ai_consensus', 'key_levels', 'invalidation', 'limitations', 'final_conclusion'])
    $(`#report-${field}`).textContent = r[field] || (field === 'final_conclusion' ? r.reason : t("d.142"));
  showTerminal('result');
  if (state.resultTimer) clearInterval(state.resultTimer);
  state.resultTimer = null;
  if (actionable) {
    const update = () => {
      const seconds = Math.max(0, Math.ceil((data.signalExpiresAt - (Date.now() - state.clockOffset)) / 1000));
      const total = data.signalDuration || 1;
      $('#timer-text').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      $('#signal-timer').style.setProperty('--progress', `${Math.min(100, seconds / total * 100)}%`);
      $('#timer-label').textContent = seconds ? t("h.214") : t("d.143");
      $('#signal-status').textContent = seconds ? t("h.214") : t("d.143");
      panel.classList.toggle('expired', !seconds);
      if (!seconds && state.resultTimer) { clearInterval(state.resultTimer); state.resultTimer = null; }
    };
    update();
    if (data.signalExpiresAt > Date.now() - state.clockOffset) state.resultTimer = setInterval(update, 1000);
  } else {
    $('#signal-actions').classList.remove('hidden');
    $('#signal-analysis').classList.add('hidden');
    $('#toggle-analysis').textContent = t("h.223");
  }
  if (scroll) $('#signal-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function restoreLatest() {
  if (state.latestResult) return renderResult(state.latestResult);
  try {
    const history = await api('/api/history');
    const latest = history.analyses?.find(item => ['UP', 'DOWN'].includes(item.result?.verdict));
    if (!$('#dashboard').classList.contains('hidden') && latest && latest.id !== state.dismissedResultId && $('#terminal-processing').classList.contains('hidden'))
      renderResult({ ...latest, serverTime: history.serverTime });
  } catch { /* A missing history must not block a new analysis. */ }
}
function updateLevelPage() {
  const account = state.account;
  if (!account) return;
  const current = levels().find(level => level.id === account.tier);
  const next = levels().find(level => level.id === account.nextLevel);
  $('#level-current').textContent = account.tier || 'BASE';
  $('#level-current').style.color = current?.color || '#B2BDD0';
  $('#level-next').textContent = next ? t("d.144", next.id, money(Math.max(0, next.minDeposit - account.depositCents))) : t("h.18");
  $('#level-progress').classList.toggle('hidden', !next);
  if (next) { $('#level-progress').max = next.minDeposit; $('#level-progress').value = account.depositCents; }
  renderLevelTrack();
  const benefits = $('#level-benefits'); benefits.replaceChildren();
  for (const level of levels()) {
    const row = uiNode('button', '', 'level-benefit'); row.type = 'button'; row.dataset.levelInfo = level.id;
    row.style.setProperty('--level-color', level.color);
    row.append(uiNode('strong', level.id), uiNode('span', t("d.145", level.signalLimit ?? '∞', level.creditsLimit, level.availableAiModes.map(mode => mode.toUpperCase()).join(' / '))), uiNode('span', '›'));
    benefits.append(row);
  }
  $('#level-upgrade').classList.toggle('hidden', !next || isOwner());
}
function historyParams(page) {
  const params = new URLSearchParams({ page: String(page) });
  if (state.historyQuery) params.set('q', state.historyQuery);
  for (const [name, value] of Object.entries(state.historyFilters)) if (value) params.set(name, value);
  if (state.historyFilters.date) params.set('tz', String(new Date().getTimezoneOffset()));
  return params;
}
async function loadHistory(more = false) {
  if (state.historyLoading && more) return;
  const requestId = (state.historyRequestId || 0) + 1;
  state.historyRequestId = requestId;
  state.historyLoading = true;
  const page = more ? state.historyPage + 1 : 0;
  if (!more) { state.historyItems = []; $('#history-list').textContent = t("d.146"); }
  $('#history-more').disabled = true;
  try {
    const data = await api(`/api/history?${historyParams(page)}`);
    if (requestId !== state.historyRequestId) return;
    if (page === 0) state.historyItems = [];
    state.historyItems.push(...data.analyses);
    state.historyPage = page;
    state.historyHasMore = data.hasMore;
    renderHistory();
  } catch (error) {
    if (requestId !== state.historyRequestId) return;
    if (!more) $('#history-list').textContent = t("d.147", error.message);
    else $('#history-more').textContent = t("d.148");
  } finally {
    if (requestId === state.historyRequestId) { state.historyLoading = false; $('#history-more').disabled = false; }
  }
}
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren();
  if (!state.historyItems.length) {
    const empty = uiNode('div', '', 'history-empty');
    empty.append(uiNode('span', '◷', 'empty-icon'), uiNode('h2', t("d.149")), uiNode('p', t("d.150")));
    const action = uiNode('button', t("d.151"), 'button primary'); action.type = 'button'; action.addEventListener('click', () => navigate('dashboard')); empty.append(action); list.append(empty);
  }
  for (const item of state.historyItems) {
    const row = uiNode('button', '', 'history-row'); row.type = 'button'; row.dataset.historyId = item.id;
    const direction = item.result?.verdict === 'DOWN' ? t("h.144") : t("h.143");
    const meta = uiNode('span', new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at)), 'history-date');
    const main = uiNode('span', '', 'history-row-main');
    main.append(uiNode('strong', item.result?.pair || item.asset || t("d.152")), uiNode('span', direction, item.result?.verdict === 'DOWN' ? 'direction-down' : 'direction-up'), uiNode('small', `${(item.mode || 'Fast').toUpperCase()} AI`));
    row.append(meta, main, uiNode('span', item.result?.final_conclusion || item.result?.reason || t("d.153"), 'history-summary'));
    if (locationView().recordId === item.id) row.classList.add('selected');
    list.append(row);
  }
  $('#history-more').classList.toggle('hidden', !state.historyHasMore);
  $('#history-more').textContent = t("h.146");
  const chips = $('#history-chips'); chips.replaceChildren();
  for (const [name, value] of Object.entries({ q: state.historyQuery, ...state.historyFilters })) if (value) chips.append(uiNode('span', `${{ q: t("d.154"), date: t("h.139"), mode: t("h.140"), direction: t("h.142") }[name]}: ${value}`));
}
function closeHistoryDetail() {
  $('#history-detail').classList.add('hidden');
  $('#history').classList.remove('detail-open');
}
async function openHistoryDetail(id) {
  if (!id) return;
  const panel = $('#history-detail'); const body = $('#history-detail-body');
  panel.classList.remove('hidden'); $('#history').classList.add('detail-open');
  body.textContent = t("d.155");
  try {
    const item = (await api(`/api/history/${encodeURIComponent(id)}`)).analysis;
    if (locationView().recordId !== id) return;
    body.replaceChildren();
    if (item.preview) {
      const image = document.createElement('img'); image.src = item.preview; image.alt = t("d.156"); image.className = 'history-preview';
      image.addEventListener('click', () => showPreview(item.preview)); body.append(image);
    }
    body.append(uiNode('span', new Intl.DateTimeFormat(locale(), { dateStyle: 'long', timeStyle: 'short' }).format(new Date(item.created_at)), 'history-date'));
    body.append(uiNode('h2', `${item.result?.pair || item.asset} · ${item.result?.verdict === 'DOWN' ? t("h.144") : t("h.143")}`));
    body.append(uiNode('p', `${(item.mode || 'Fast').toUpperCase()} AI · ${item.result?.timeframe || t("d.157")} · ${item.result?.current_price || t("d.158")}`, 'history-detail-meta'));
    body.append(uiNode('p', item.result?.final_conclusion || item.result?.reason || '', 'history-conclusion'));
    const dl = uiNode('dl', '', 'history-report');
    for (const [field, label] of Object.entries({ trend: t("h.225"), structure: t("h.226"), momentum: 'Momentum', volatility: 'Volatility', historical_match: 'Historical Match', ai_consensus: 'AI Consensus', key_levels: t("h.151"), invalidation: t("h.227"), limitations: t("h.228") })) {
      if (!item.result?.[field]) continue;
      const row = uiNode('div'); row.append(uiNode('dt', label), uiNode('dd', item.result[field])); dl.append(row);
    }
    body.append(dl);
    renderHistory();
  } catch (error) { if (locationView().recordId === id) body.textContent = t("d.159", error.message); }
}
function showPreview(source) {
  $('#preview-full').src = source;
  $('#preview-dialog').showModal();
}
function createPreview(source) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const preview = canvas.toDataURL('image/jpeg', .62);
      resolve(preview.length <= 120_000 ? preview : null);
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}
// Mobile drawer focus management supplements the native dialog behavior used elsewhere.
function initDrawer() {
  const menu = document.getElementById('site-menu');
  const toggle = document.getElementById('site-menu-toggle');
  const close = () => { menu.classList.add('hidden'); toggle.setAttribute('aria-expanded', 'false'); };
  document.getElementById('site-menu-close')?.addEventListener('click', close);
  document.getElementById('menu-backdrop')?.addEventListener('click', close);
  let wasOpen = false;
  const sync = () => {
    const mobile = matchMedia('(max-width: 767px)').matches;
    const open = !menu.classList.contains('hidden');
    document.body.classList.toggle('menu-open', mobile && open);
    if (mobile && open) { menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-modal', 'true'); }
    else { menu.removeAttribute('role'); menu.removeAttribute('aria-modal'); }
    if (mobile && open && !wasOpen) document.getElementById('site-menu-close')?.focus();
    if (mobile && !open && wasOpen && menu.contains(document.activeElement)) toggle.focus();
    wasOpen = open;
  };
  new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
  matchMedia('(max-width: 767px)').addEventListener('change', sync);
  document.addEventListener('keydown', event => {
    if (menu.classList.contains('hidden')) return;
    if (event.key === 'Escape') { close(); toggle.focus(); }
    if (event.key !== 'Tab' || !matchMedia('(max-width: 767px)').matches) return;
    const elements = [...menu.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}

async function init() {
  initDrawer();
  showTerminal('empty');
  renderLevels();
  document.addEventListener('click', event => {
    const info = event.target.closest('[data-level-info]');
    if (info) openLevelDetails(info.dataset.levelInfo);
  });
  $('#close-level').addEventListener('click', () => $('#level-dialog').close());
  $('#level-dialog').addEventListener('click', event => { if (event.target.id === 'level-dialog') event.target.close(); });
  $('#expiry-options').addEventListener('click', event => {
    const button = event.target.closest('[data-expiry]'); if (!button) return;
    state.expiry = Number(button.dataset.expiry);
    for (const option of $('#expiry-options').querySelectorAll('[data-expiry]')) {
      option.classList.toggle('selected', option === button);
      option.setAttribute('aria-pressed', String(option === button));
    }
  });
  if (staticPreview) {
    $('#preview-banner').classList.remove('hidden');
    disableRegistration();
    message($('#register-message'), t("d.160"));
  }
  try {
    state.config = await api('/api/config');
    const expiryReady = state.config.analysisApiVersion >= 2;
    $('#expiry-options').classList.toggle('hidden', !expiryReady);
    $('.expiry-heading').classList.toggle('hidden', !expiryReady);
    renderLevels();
    if (!state.config.attributionConfigured) {
      message($('#id-message'), t("d.161"));
      message($('#register-message'), t("d.162"));
      disableRegistration();
    } else {
      for (const link of document.querySelectorAll('[data-registration-link]')) link.href = `${apiBase}/go`;
      document.querySelector('#deposit a.button').href = `${apiBase}/go`;
    }
  } catch {
    disableRegistration();
    message($('#register-message'), t("d.163"));
  }
  if (state.token) {
    try { await api('/api/auth/session', { method: 'POST' }); }
    catch { /* An expired legacy token cannot restore the session. */ }
    state.token = null;
    removeSession();
  }
  const session = staticPreview ? { status: 'guest' } : await refreshSession(false, true);
  if (session) {
    if (staticPreview) state.status = 'guest';
    routeFromStatus();
  } else {
    $('#auth-loading').classList.remove('hidden');
    $('#auth-retry').addEventListener('click', () => window.location.reload(), { once: true });
    $('#auth-loading-message').textContent = t("d.164");
    $('#auth-retry').classList.remove('hidden');
  }
  $('.brand').addEventListener('click', event => { event.preventDefault(); navigate(state.status === 'active' ? 'dashboard' : 'landing'); });
  document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.route)));
  $('#sidebar-collapse').addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    $('#sidebar-collapse').setAttribute('aria-expanded', String(!collapsed));
    $('#sidebar-collapse').setAttribute('aria-label', collapsed ? t("d.165") : t("h.11"));
  });
  $('#settings-security').addEventListener('click', () => { navigate('account'); $('#account-security-anchor')?.scrollIntoView({ behavior: 'smooth' }); });
  $('#level-upgrade').addEventListener('click', openUpgrade);
  $('#history-list').addEventListener('click', event => {
    const row = event.target.closest('[data-history-id]');
    if (row) navigate('history-detail', row.dataset.historyId);
  });
  $('#history-more').addEventListener('click', () => loadHistory(true));
  let historySearchTimer;
  $('#history-search').addEventListener('input', event => {
    clearTimeout(historySearchTimer);
    historySearchTimer = setTimeout(() => { state.historyQuery = event.target.value.trim(); loadHistory(false); }, 250);
  });
  $('#history-filter-button').addEventListener('click', () => {
    const open = $('#history-filters').classList.toggle('hidden') === false;
    $('#history-filter-button').setAttribute('aria-expanded', String(open));
  });
  for (const [id, key] of [['history-date', 'date'], ['history-mode', 'mode'], ['history-direction', 'direction']])
    $(`#${id}`).addEventListener('change', event => { state.historyFilters[key] = event.target.value; loadHistory(false); });
  $('#history-clear').addEventListener('click', () => {
    state.historyQuery = ''; state.historyFilters = {}; $('#history-search').value = '';
    for (const id of ['history-date', 'history-mode', 'history-direction']) $(`#${id}`).value = '';
    loadHistory(false);
  });
  for (const id of ['history-back', 'history-close']) $(`#${id}`).addEventListener('click', () => show('history', 'replace'));
  $('#result-preview-open').addEventListener('click', () => showPreview($('#result-preview').src));
  $('#preview-close').addEventListener('click', () => $('#preview-dialog').close());
  $('#preview-dialog').addEventListener('click', event => { if (event.target.id === 'preview-dialog') event.target.close(); });
  $('#mode-select').addEventListener('click', () => {
    const list = $('#mode-options'); const expanded = list.classList.toggle('hidden') === false;
    $('#mode-select').setAttribute('aria-expanded', String(expanded));
  });
  $('#begin-button').addEventListener('click', () => navigate('register'));
  for (const id of ['landing-login', 'register-login', 'menu-login']) $(`#${id}`)?.addEventListener('click', () => navigate('login'));
  $('#header-upgrade')?.addEventListener('click', openUpgrade);
  $('#header-account')?.addEventListener('click', () => navigate('account'));
  $('#header-owner')?.addEventListener('click', () => navigate('owner-stats-view'));
  $('#login-first').addEventListener('click', () => navigate('register'));
  $('#forgot-password').addEventListener('click', () => $('#forgot-dialog').showModal());
  $('#close-forgot').addEventListener('click', () => $('#forgot-dialog').close());
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#login-form button[type=submit]'); button.disabled = true;
    $('#login-message').classList.add('hidden');
    try {
      if ($('#login-id').value.trim().toLowerCase() === 'owner') {
        await enterOwnerCode($('#login-password').value);
        $('#login-password').value = '';
        return;
      }
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({
        accountId: $('#login-id').value.trim(), password: $('#login-password').value,
        remember: true,
      }) });
      $('#login-password').value = ''; acceptAuth(result);
    } catch (error) { message($('#login-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#setup-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('#setup-password').value;
    if (password !== $('#setup-confirm').value) return message($('#setup-message'), t("d.166"));
    const button = $('#setup-form button[type=submit]'); button.disabled = true;
    try {
      const result = await api('/api/auth/setup', { method: 'POST', body: JSON.stringify({ password }) });
      $('#setup-form').reset(); acceptAuth(result);
    } catch (error) {
      message($('#setup-message'), error.code === 'ACCOUNT_EXISTS'
        ? t("d.167") : error.message);
    }
    finally { button.disabled = false; }
  });
  $('#setup-back').addEventListener('click', () => navigate('access'));
  $('#setup-logout').addEventListener('click', logoutCurrent);
  $('#deposit-logout').addEventListener('click', logoutCurrent);
  $('#go-to-verification').addEventListener('click', () => navigate('access'));
  $('#back-to-registration').addEventListener('click', () => navigate('register'));
  $('#continue-activation').addEventListener('click', () => navigate('deposit'));
  $('#owner-stats-link').addEventListener('click', () => navigate('owner-stats-view'));
  $('#menu-terminal').addEventListener('click', () => navigate('dashboard'));
  $('#menu-account').addEventListener('click', () => navigate('account'));
  $('#menu-settings').addEventListener('click', () => navigate('settings'));
  $('#account-back').addEventListener('click', () => navigate('dashboard'));
  $('#account-upgrade').addEventListener('click', openUpgrade);
  $('#change-password-open').addEventListener('click', () => $('#change-password-dialog').showModal());
  $('#close-change-password').addEventListener('click', () => $('#change-password-dialog').close());
  $('#change-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const newPassword = $('#new-password').value;
    if (newPassword !== $('#new-password-confirm').value) return message($('#change-password-message'), t("d.168"));
    const button = $('#change-password-form button[type=submit]'); button.disabled = true;
    try {
      const result = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword }) });
      $('#change-password-form').reset(); $('#change-password-dialog').close();
      acceptAuth(result); message($('#security-message'), t("d.169"), false);
    } catch (error) { message($('#change-password-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#owner-migration-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('#owner-migration-form button[type=submit]'); button.disabled = true;
    try {
      const result = await api('/api/admin/migrate-owner', { method: 'POST', body: JSON.stringify({
        accountId: $('#owner-migration-id').value.trim(), password: $('#owner-migration-password').value,
      }) });
      $('#owner-migration-form').reset(); acceptAuth(result);
      message($('#security-message'), t("d.170"), false);
    } catch (error) { message($('#owner-migration-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#site-menu-toggle').addEventListener('click', () => {
    const opening = $('#site-menu').classList.contains('hidden');
    $('#site-menu').classList.toggle('hidden', !opening);
    $('#site-menu-toggle').setAttribute('aria-expanded', String(opening));
    if (opening) { $('#account-status').classList.add('hidden'); $('#account-summary').setAttribute('aria-expanded', 'false'); }
  });
  $('#upgrade-link').addEventListener('click', openUpgrade);
  $('#account-summary').addEventListener('click', async () => {
    const popover = $('#account-status');
    const opening = popover.classList.contains('hidden');
    popover.classList.toggle('hidden', !opening);
    $('#account-summary').setAttribute('aria-expanded', String(opening));
    if (opening) { $('#site-menu').classList.add('hidden'); $('#site-menu-toggle').setAttribute('aria-expanded', 'false'); }
    if (opening) await refreshSession(false);
  });
  document.addEventListener('click', event => {
    if (!$('#account-widget').contains(event.target)) {
      $('#account-status').classList.add('hidden');
      $('#account-summary').setAttribute('aria-expanded', 'false');
    }
    if (!event.target.closest('.site-menu-wrap')) {
      $('#site-menu').classList.add('hidden');
      $('#site-menu-toggle').setAttribute('aria-expanded', 'false');
    }
  });
  $('#status-upgrade').addEventListener('click', () => { $('#account-status').classList.add('hidden'); $('#account-summary').setAttribute('aria-expanded', 'false'); openUpgrade(); });
  $('#dashboard-upgrade').addEventListener('click', openUpgrade);
  $('#close-upgrade').addEventListener('click', () => $('#upgrade-dialog').close());
  $('#upgrade-dialog').addEventListener('click', event => { if (event.target.id === 'upgrade-dialog') event.target.close(); });
  setInterval(updateCycleTime, 30_000);
  $('#back-terminal').addEventListener('click', () => navigate('dashboard'));
  $('#account-logout').addEventListener('click', logoutCurrent);
  $('#menu-logout').addEventListener('click', logoutCurrent);
  $('#logout-all').addEventListener('click', async () => {
    const button = $('#logout-all'); button.disabled = true;
    try { await api('/api/auth/logout-all', { method: 'POST' }); clearAuth(); }
    catch (error) { message($('#security-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#owner-refresh').addEventListener('click', refreshOwnerStats);
  $('#owner-refresh').addEventListener('click', () => refreshOwnerUsers(false));
  let ownerSearchTimer;
  $('#owner-search').addEventListener('input', () => { clearTimeout(ownerSearchTimer); ownerSearchTimer = setTimeout(() => refreshOwnerUsers(false), 250); });
  $('#owner-filters').addEventListener('click', event => {
    const chip = event.target.closest('[data-filter]'); if (!chip) return;
    state.ownerFilter = chip.dataset.filter;
    for (const button of $('#owner-filters').querySelectorAll('[data-filter]')) button.classList.toggle('active', button === chip);
    refreshOwnerUsers(false);
  });
  $('#owner-more').addEventListener('click', () => refreshOwnerUsers(true));
  $('#owner-users-body').addEventListener('click', async event => {
    const reset = event.target.closest('[data-reset-password]');
    if (reset) {
      event.stopPropagation();
      await openOwnerUser(reset.dataset.resetPassword);
      $('#owner-temporary-password')?.focus();
      return;
    }
    const row = event.target.closest('[data-account-id]'); if (row) openOwnerUser(row.dataset.accountId);
  });
  $('#owner-users-body').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key) && event.target.matches('[data-account-id]')) { event.preventDefault(); openOwnerUser(event.target.dataset.accountId); } });
  $('#close-owner-user').addEventListener('click', () => $('#owner-user-dialog').close());
  $('#owner-user-dialog').addEventListener('click', event => { if (event.target.id === 'owner-user-dialog') event.target.close(); });
  $('#owner-user-content').addEventListener('click', async event => {
    if (event.target.id === 'owner-more-signals') {
      const button = event.target; button.disabled = true;
      try { renderOwnerUser(await api(`/api/admin/users/${state.ownerUserId}?page=${button.dataset.page}`), true); }
      catch (error) { button.textContent = error.message; button.disabled = false; }
    }
    if (event.target.id === 'owner-user-refresh') {
      const button = event.target; button.disabled = true;
      try { renderOwnerUser(await api(`/api/admin/users/${state.ownerUserId}/refresh`, { method: 'POST' })); refreshOwnerUsers(false); refreshOwnerStats(); }
      catch (error) { button.textContent = error.message; button.disabled = false; }
    }
  });
  $('#owner-user-content').addEventListener('submit', async event => {
    if (event.target.id !== 'owner-password-reset') return;
    event.preventDefault();
    if (!window.confirm(t("d.171", state.ownerUserId))) return;
    const button = event.target.querySelector('button[type=submit]'); button.disabled = true;
    try {
      await api(`/api/admin/users/${state.ownerUserId}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword: $('#owner-temporary-password').value }) });
      event.target.reset();
      message($('#owner-reset-message'), t("d.172"), false);
    } catch (error) { message($('#owner-reset-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#id-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#id-form button'); button.disabled = true; button.textContent = t("d.173");
    $('#id-message').classList.add('hidden'); $('#continue-activation').classList.add('hidden');
    try {
      const value = $('#account-id').value.trim();
      if (!/^\d{3,64}$/.test(value)) {
        await enterOwnerCode(value);
        return;
      }
      const result = await api('/api/claim', { method: 'POST', body: JSON.stringify({ accountId: value }) });
      acceptAuth(result);
    } catch (error) {
      message($('#id-message'), error.message + (error.code === 'ID_NOT_FOUND' ? t("d.174") : ''));
      if (error.code === 'ACCOUNT_EXISTS') {
        const login = uiNode('button', t("d.175"), 'text-link'); login.type = 'button';
        login.addEventListener('click', () => navigate('login'), { once: true }); $('#id-message').append(login);
      }
    }
    finally { button.disabled = false; button.innerHTML = t("d.176"); }
  });
  $('#check-deposit').addEventListener('click', async () => {
    const button = $('#check-deposit'); button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setActivationMessage('d.177');
    try {
      const account = await api('/api/activation/check', { method: 'POST' });
      state.account = account; state.status = account.status; state.accountId = account.accountId;
      if (account.status === 'active') { setActivationMessage('h.112'); routeFromStatus(); }
      else if (account.status === 'guest') routeFromStatus();
      else setActivationMessage('d.178', true);
    } catch { setActivationMessage('d.109', true); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  });
  $('#close-mode').addEventListener('click', () => $('#mode-dialog').close());
  $('#mode-dialog').addEventListener('click', event => { if (event.target.id === 'mode-dialog') event.target.close(); });
  $('#screenshot-help').addEventListener('click', () => $('#screenshot-guide').showModal());
  $('#close-guide').addEventListener('click', () => $('#screenshot-guide').close());
  $('#screenshot-guide').addEventListener('click', event => { if (event.target.id === 'screenshot-guide') event.target.close(); });
  $('#chart-file').addEventListener('change', e => setFile(e.target.files[0]));
  $('#select-image').addEventListener('click', () => $('#chart-file').click());
  $('#replace-file').addEventListener('click', () => $('#chart-file').click());
  $('#dropzone').addEventListener('click', e => {
    if (e.target === $('#dropzone') || e.target.id === 'preview-img') $('#chart-file').click();
  });
  $('#dropzone').addEventListener('dragover', e => { e.preventDefault(); $('#dropzone').classList.add('dragging'); });
  $('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragging'));
  $('#dropzone').addEventListener('drop', e => { e.preventDefault(); $('#dropzone').classList.remove('dragging'); setFile(e.dataTransfer.files[0]); });
  document.addEventListener('paste', event => {
    if ($('#dashboard').classList.contains('hidden') || (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]'))) return;
    const item = [...(event.clipboardData?.items || [])].find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
    const image = item?.getAsFile();
    if (!image) return;
    event.preventDefault();
    setFile(new File([image], image.name || t("d.179"), { type: image.type }));
  });
  $('#remove-file').addEventListener('click', e => {
    e.stopPropagation(); state.file = null; $('#chart-file').value = '';
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    $('#image-preview').classList.add('hidden'); $('#empty-upload').classList.remove('hidden');
    $('#dashboard').classList.remove('has-file');
  });
  $('#mode-options').addEventListener('click', e => {
    const info = e.target.closest('[data-mode-info]'); if (info) return showModeDetails(info.dataset.modeInfo);
    const card = e.target.closest('[data-mode]'); if (!card) return;
    if (card.getAttribute('aria-disabled') === 'true') {
      navigate('level'); return;
    }
    state.mode = card.dataset.mode; updateModes(); $('#analysis-error').classList.add('hidden');
    $('#mode-options').classList.add('hidden'); $('#mode-select').setAttribute('aria-expanded', 'false');
  });
  $('#toggle-analysis').addEventListener('click', () => {
    const hidden = $('#signal-analysis').classList.toggle('hidden');
    $('#toggle-analysis').textContent = hidden ? t("h.223") : t("d.180");
    $('#toggle-analysis').setAttribute('aria-expanded', String(!hidden));
  });
  $('#new-analysis').addEventListener('click', () => {
    state.dismissedResultId = state.latestResult?.id || null;
    state.latestResult = null; state.mode = 'Fast'; updateModes();
    if (state.resultTimer) clearInterval(state.resultTimer); state.resultTimer = null;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null; state.file = null; $('#chart-file').value = ''; $('#preview-img').removeAttribute('src');
    $('#image-preview').classList.add('hidden'); $('#empty-upload').classList.remove('hidden');
    $('#dashboard').classList.remove('has-file');
    $('#analysis-error').classList.add('hidden'); showTerminal('empty');
    $('#dropzone').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#analysis-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.file) return message($('#analysis-error'), t("d.181"));
    if (!state.account?.modes?.includes(state.mode) && state.role !== 'admin' && !state.account?.special)
      return message($('#analysis-error'), t("d.182"));
    const button = $('#analyze-button'); button.disabled = true; button.textContent = t("d.183");
    $('#analysis-error').classList.add('hidden');
    beginProcessing(state.mode);
    let sentAt = null;
    try {
      const image = await imageDataUrl(state.file);
      const preview = await createPreview(image);
      imagePrepared();
      sentAt = Date.now();
      const result = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ image, preview, mode: state.mode, expiry: state.expiry, language: window.BluFinI18n.language }) });
      window.dispatchEvent(new CustomEvent('blufin:analysis-state', { detail: 'done' }));
      await new Promise(resolve => setTimeout(resolve, 330));
      renderResult(result, true);
      if (result.account) { state.account = result.account; updateTerminalAccount(); }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('blufin:analysis-state', { detail: 'error' }));
      // If the network lost a completed response, recover the committed signal instead of charging for a retry.
      if (sentAt && ['NETWORK_ERROR', 'INVALID_SERVER_RESPONSE'].includes(error.code)) {
        try {
          const history = await api('/api/history');
          const saved = history.analyses?.find(item => item.created_at >= sentAt && item.mode === state.mode);
          if (saved) {
            renderResult({ ...saved, serverTime: history.serverTime }, true);
            await refreshSession(false, true);
            return;
          }
        } catch { /* The original error is still useful if history is unavailable. */ }
      }
      showTerminal(state.latestResult ? 'result' : 'empty');
      showAnalysisError(error);
      $('#analysis-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (sentAt) await refreshSession(false, true);
    } finally { button.disabled = false; button.innerHTML = t("d.184"); }
  });
}
document.addEventListener('blufin:languagechange', () => {
  renderLevels();
  if (state.status === 'deposit') updateActivation();
  if ($('#level-dialog').open) openLevelDetails($('#level-title').textContent);
  if ($('#mode-dialog').open) showModeDetails($('#mode-title').textContent.split(' ')[0].toLowerCase().replace(/^./, letter => letter.toUpperCase()));
  if ($('#upgrade-dialog').open) openUpgrade();
  if (state.status === 'active') {
    updateTerminalAccount();
    updateAccountPage();
    updateLevelPage();
    if (state.historyItems.length) renderHistory();
    if (state.latestResult && !$('#terminal-result').classList.contains('hidden')) renderResult(state.latestResult);
    const current = locationView();
    if (current.view === 'history-detail') openHistoryDetail(current.recordId);
  }
  const view = locationView().view;
  $('#view-title').textContent = { dashboard: t('h.5'), history: t('h.6'), level: t('h.7'), account: t('h.8'), settings: t('h.9'), 'owner-stats-view': t('h.10') }[view] || '';
});
init();
