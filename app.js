const $ = selector => document.querySelector(selector);
const SESSION_KEY = 'blufin_session';
const state = { status: 'loading', role: null, accountId: null, account: null, file: null, mode: 'Fast', expiry: 3, config: null, polling: null, resultTimer: null, latestResult: null, dismissedResultId: null, clockOffset: 0, ownerFilter: 'all', ownerPage: 0, ownerUserId: null, token: localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY), historyItems: [], historyPage: 0, historyQuery: '', historyFilters: {}, historyLoading: false };
function removeSession() { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }
const views = ['landing', 'login', 'register', 'access', 'password-setup', 'deposit', 'dashboard', 'history', 'level', 'account', 'settings', 'owner-stats-view'];
const apiBase = (window.BLUFIN_API_BASE || '').replace(/\/$/, '');
const staticPreview = window.BLUFIN_STATIC_PREVIEW === true && !apiBase;
const fallbackLevels = [
  { id: 'BASE', minDeposit: 2000, signalLimit: 3, creditsLimit: 30, availableAiModes: ['Fast'], color: '#8994A7' },
  { id: 'PLUS', minDeposit: 5000, signalLimit: 10, creditsLimit: 300, availableAiModes: ['Fast', 'Deep'], color: '#4266A6' },
  { id: 'PRO', minDeposit: 7500, signalLimit: 30, creditsLimit: 1000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#788FB8' },
  { id: 'ADVANCED', minDeposit: 10000, signalLimit: 70, creditsLimit: 3000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#C96D76' },
  { id: 'ULTRA', minDeposit: 20000, signalLimit: null, creditsLimit: 10000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#D5B967' },
];
function levels() { return state.config?.levels?.length === 5 ? state.config.levels : fallbackLevels; }
function renderLevelTrack() {
  const current = levels().findIndex(level => level.id === state.account?.tier);
  for (const id of ['dashboard-level-track', 'account-level-track', 'level-view-track']) {
    const track = $(`#${id}`); if (!track) continue;
    track.replaceChildren(...levels().map((level, index) => {
      const item = document.createElement('div');
      item.className = `track-step ${index < current ? 'completed' : index === current ? 'current' : 'future'}`;
      item.style.setProperty('--track-color', level.color || '#8994A7');
      item.setAttribute('aria-current', index === current ? 'step' : 'false');
      const dot = document.createElement('span'); dot.className = 'track-dot'; dot.textContent = index < current ? '✓' : String(index + 1);
      const label = document.createElement('strong'); label.textContent = level.id;
      item.append(dot, label); return item;
    }));
    track.setAttribute('aria-label', `Ваш уровень: ${state.account?.tier || 'BASE'}. Прогресс уровней`);
  }
}
function renderLevels() {
  const cards = levels().map(level => {
    const card = document.createElement('article');
    card.className = 'level-card'; card.dataset.tier = level.id;
    card.style.setProperty('--level-color', level.color || '#8994A7');
    const title = document.createElement('h3'); title.textContent = level.id;
    const info = document.createElement('button'); info.type = 'button'; info.className = 'level-info';
    info.dataset.levelInfo = level.id; info.setAttribute('aria-label', `Подробнее об уровне ${level.id}`); info.textContent = '?';
    const price = document.createElement('strong'); price.className = 'level-price'; price.textContent = `Депозит от ${money(level.minDeposit)}`;
    const signals = document.createElement('strong'); signals.className = 'level-signals';
    signals.textContent = level.signalLimit === null ? 'Безлимит' : `${level.signalLimit} ${level.signalLimit === 3 ? 'сигнала' : 'сигналов'} / 24 ч`;
    const extra = document.createElement('div'); extra.className = 'level-extra';
    const modes = level.availableAiModes.map(mode => `${mode.toUpperCase()} AI`).join(' · ');
    extra.textContent = `${level.creditsLimit.toLocaleString('en-US')} AI Credits`;
    const abilities = document.createElement('div'); abilities.className = 'level-modes'; abilities.textContent = modes;
    const detail = document.createElement('small'); detail.className = 'level-detail';
    detail.textContent = level.id === 'ULTRA' ? 'Максимальный доступ' : level.id === 'ADVANCED' ? 'Расширенные лимиты' : level.id === 'PRO' ? 'Все AI режимы' : level.id === 'PLUS' ? 'Глубокий анализ' : 'Базовый анализ';
    card.append(title, info, price, signals, extra, abilities, detail); return card;
  });
  $('#public-level-cards').replaceChildren(...cards);
  $('#activation-levels').replaceChildren(...cards.map(card => card.cloneNode(true)));
  const costs = state.config?.aiModes || { Fast: { cost: 10 }, Deep: { cost: 100 }, Maximum: { cost: 500 } };
  $('#faq-modes').textContent = `FAST даёт краткий разбор (${costs.Fast.cost} AI Credits, с BASE); DEEP анализирует структуру и альтернативный сценарий (${costs.Deep.cost}, с PLUS); MAXIMUM даёт наиболее полный разбор данных изображения (${costs.Maximum.cost}, с PRO).`;
  $('#faq-levels').textContent = `Уровни определяют режимы и лимиты на 24 часа: ${levels().map(level => `${level.id} — ${level.signalLimit ?? 'безлимит'} сигналов и ${level.creditsLimit} AI Credits`).join('; ')}. Депозиты учитываются суммарно.`;
  $('#faq-credits').textContent = `AI Credits расходуются за успешный анализ: FAST ${costs.Fast.cost}, DEEP ${costs.Deep.cost}, MAXIMUM ${costs.Maximum.cost}. Остаток и время обновления индивидуального 24-часового периода показаны в аккаунте. Неудачный запрос не списывает Credits.`;
}
function openLevelDetails(id) {
  const list = levels();
  const index = list.findIndex(level => level.id === id);
  if (index < 0) return;
  const level = list[index];
  const previous = list[index - 1];
  const purpose = {
    BASE: 'Для нескольких быстрых проверок в день.',
    PLUS: 'Для регулярного анализа с доступом к DEEP AI.',
    PRO: 'Для частого анализа со всеми AI режимами.',
    ADVANCED: 'Для активной работы с большим дневным лимитом.',
    ULTRA: 'Для максимального объёма анализа без лимита сигналов.',
  }[id];
  const details = [
    ['Минимальный депозит', money(level.minDeposit)],
    ['Сигналы за 24 часа', level.signalLimit === null ? 'Безлимит' : String(level.signalLimit)],
    ['AI Credits за 24 часа', level.creditsLimit.toLocaleString('en-US')],
    ['AI режимы', level.availableAiModes.map(mode => `${mode.toUpperCase()} AI`).join(' · ')],
    ['Отличие', previous ? `${level.signalLimit === null ? 'Безлимит сигналов' : `+${level.signalLimit - previous.signalLimit} сигналов`}, +${(level.creditsLimit - previous.creditsLimit).toLocaleString('en-US')} AI Credits${level.availableAiModes.length > previous.availableAiModes.length ? ', новый AI режим' : ''}` : 'Начальный уровень доступа'],
  ];
  $('#level-title').textContent = id;
  const box = $('#level-details'); box.replaceChildren();
  const listNode = uiNode('dl', '', 'level-detail-list');
  for (const [label, value] of details) {
    const row = uiNode('div'); row.append(uiNode('dt', label), uiNode('dd', value)); listNode.append(row);
  }
  box.append(listNode, uiNode('p', purpose));
  $('#level-dialog').style.setProperty('--level-color', fallbackLevels.find(item => item.id === id)?.color || '#8994A7');
  $('#level-dialog').showModal();
}
function updateActivation() {
  const amount = state.account?.depositCents || 0;
  $('#deposit-progress').classList.toggle('hidden', amount <= 0);
  if (amount <= 0) return;
  const current = [...levels()].reverse().find(level => amount >= level.minDeposit);
  const next = levels().find(level => amount < level.minDeposit);
  $('#deposit-total').textContent = money(amount);
  $('#deposit-tier').textContent = current?.id || 'Не открыт';
  for (const id of ['deposit-next-row', 'deposit-remaining-row', 'deposit-progress-row'])
    $(`#${id}`).classList.toggle('hidden', !next);
  $('#deposit-max').classList.toggle('hidden', Boolean(next));
  if (!next) return;
  $('#deposit-next').textContent = next.id;
  $('#deposit-remaining-label').textContent = `До ${next.id} осталось`;
  $('#deposit-remaining').textContent = money(next.minDeposit - amount);
  $('#deposit-progress-label').textContent = `${money(amount)} / ${money(next.minDeposit)}`;
  $('#deposit-progress-bar').value = Math.min(100, 100 * amount / next.minDeposit);
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
    $('#status-reset').textContent = 'Период ещё не начат';
    return;
  }
  const minutes = Math.ceil((reset - (Date.now() - state.clockOffset)) / 60000);
  $('#status-reset').textContent = `через ${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
function updateTerminalAccount() {
  const a = state.account;
  if (!a || a.status !== 'active') return;
  const rank = state.config?.levels?.findIndex(level => level.id === a.tier) + 1;
  const tint = fallbackLevels.find(level => level.id === a.tier)?.color || '#8994A7';
  $('#account-widget').style.setProperty('--tier-color', tint);
  $('#summary-tier').textContent = a.tier || 'BASE';
  $('#summary-credits').textContent = a.creditsTotal === null ? 'AI Credits: безлимит' : `${a.creditsRemaining} AI Credits`;
  $('#summary-signals').textContent = a.signalLimit === null ? 'Сигналы: безлимит' : `${a.signalsUsed || 0} / ${a.signalLimit} сигналов`;
  $('#summary-next').textContent = a.nextLevel && !isOwner() ? `До ${a.nextLevel}: ${money(Math.max(0, a.nextLevelDepositCents - a.depositCents))}` : '';
  $('#status-tier').textContent = a.tier || 'Нет уровня';
  $('#status-rank').textContent = isOwner() ? 'Владелец' : `Уровень ${rank || 1}`;
  $('#status-modes').textContent = `Режимы: ${(a.modes || []).map(mode => `${mode.toUpperCase()} AI`).join(' · ') || 'FAST AI'}`;
  renderLevelTrack();
  $('#status-deposits').textContent = isOwner() ? 'Личный доступ' : money(a.depositCents);
  $('#status-credits').textContent = a.creditsTotal === null ? 'Безлимит' : `${a.creditsRemaining} / ${a.creditsTotal}`;
  $('#status-signals').textContent = `${a.signalsUsed || 0} / ${a.signalLimit === null ? '∞' : a.signalLimit}`;
  $('#status-next').classList.toggle('hidden', !a.nextLevel || isOwner());
  $('#status-max').classList.toggle('hidden', Boolean(a.nextLevel) || isOwner());
  $('#status-cycle-note').classList.toggle('hidden', Boolean(a.cycleResetAt));
  if (a.nextLevel) {
    $('#status-next-text').textContent = `До ${a.nextLevel}: ${money(Math.max(0, a.nextLevelDepositCents - a.depositCents))}`;
    const current = state.config?.levels?.find(level => level.id === a.tier)?.minDeposit || 0;
    $('#status-progress').value = Math.min(100, 100 * Math.max(0, (a.depositCents - current) / (a.nextLevelDepositCents - current)));
  }
  if (!a.nextLevel && !isOwner()) $('#status-reset').title = 'Максимальный уровень открыт';
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
  difference.append(uiNode('span', `До ${next.id} осталось`), uiNode('strong', money(Math.max(0, next.minDeposit - a.depositCents))));
  box.append(difference);
  const label = uiNode('p', `${money(a.depositCents)} / ${money(next.minDeposit)}`, 'upgrade-progress-label'); box.append(label);
  const progress = document.createElement('progress'); progress.max = next.minDeposit; progress.value = a.depositCents; box.append(progress);
  const comparison = uiNode('div', '', 'upgrade-comparison');
  for (const [heading, tier] of [['СЕЙЧАС', current], ['ПОСЛЕ ПОВЫШЕНИЯ', next]]) {
    const group = uiNode('div', '', 'upgrade-column');
    group.append(uiNode('span', heading), uiNode('strong', tier.id),
      uiNode('p', `${tier.signalLimit === null ? 'Безлимит сигналов' : `${tier.signalLimit} сигналов / 24 ч`}`),
      uiNode('p', `${tier.creditsLimit} AI Credits`),
      uiNode('small', tier.availableAiModes.map(mode => `${mode.toUpperCase()} AI`).join(' · ')));
    comparison.append(group);
  }
  box.append(comparison);
  const benefits = uiNode('div', '', 'upgrade-gain'); benefits.append(uiNode('span', 'ВЫ ПОЛУЧИТЕ'));
  benefits.append(uiNode('strong', next.signalLimit === null ? 'Безлимит сигналов' : `+${next.signalLimit - current.signalLimit} сигналов / 24 ч`));
  benefits.append(uiNode('strong', `+${next.creditsLimit - current.creditsLimit} AI Credits`));
  for (const mode of next.availableAiModes.filter(mode => !current.availableAiModes.includes(mode))) benefits.append(uiNode('strong', `+ ${mode.toUpperCase()} AI`));
  if (next.id === 'ULTRA') benefits.append(uiNode('small', 'Максимальный уровень аккаунта'));
  box.append(benefits);
  const link = document.createElement('a'); link.className = 'button primary'; link.textContent = `Повысить до ${next.id}`;
  link.href = `${apiBase}/go`; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
  const all = uiNode('button', 'Все уровни', 'text-link'); all.type = 'button'; all.addEventListener('click', () => {
    if (box.querySelector('.upgrade-all-levels')) return box.querySelector('.upgrade-all-levels').remove();
    const list = uiNode('div', '', 'upgrade-all-levels');
    levels().forEach(level => list.append(uiNode('p', `${level.id} · от ${money(level.minDeposit)} · ${level.signalLimit ?? '∞'} сигналов · ${level.creditsLimit} AI Credits`)));
    box.append(list);
  }); box.append(all);
  $('#upgrade-dialog').showModal();
}
function updateAccountPage() {
  const a = state.account;
  if (!a || a.status !== 'active') return;
  const level = levels().find(item => item.id === a.tier);
  const tint = level?.color || '#8994A7';
  $('#account-level-name').textContent = a.tier || 'Нет уровня';
  $('#account-level-name').style.color = tint;
  $('#account-level-rank').textContent = isOwner() ? 'Владелец' : `Уровень ${levels().findIndex(item => item.id === a.tier) + 1}`;
  $('#account-id-value').textContent = a.accountId || 'Переход на вход по ID';
  $('#account-verified').textContent = a.verifiedAt ? 'Аккаунт подтверждён' : 'Ожидает проверки';
  $('#account-registered').textContent = a.registeredAt ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(a.registeredAt)) : 'Нет данных';
  $('#account-total-deposits').textContent = money(a.depositCents);
  $('#account-credits').textContent = a.creditsTotal === null ? 'Безлимит' : `${a.creditsRemaining} / ${a.creditsTotal}`;
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
  $('#security-message').textContent = a.mustChangePassword ? 'Временный пароль нужно заменить перед анализом.' : '';
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
const modeDetails = {
  Fast: { power: 30, intro: 'Краткий разбор видимых данных скриншота.', points: ['Пара, цена и таймфрейм', 'Тренд и структура', 'Волатильность', 'Краткий вывод по свечам'] },
  Deep: { power: 70, intro: 'Более подробный разбор видимой структуры и альтернативного сценария.', points: ['Пара, цена и таймфрейм', 'Тренд', 'Рыночная структура', 'Ключевые уровни', 'Momentum', 'Волатильность', 'Аргументы за и против сигнала'] },
  Maximum: { power: 100, intro: 'Максимально подробный разбор доступных данных изображения.', points: ['Пара, цена и таймфрейм', 'Тренд', 'Рыночная структура', 'Ключевые уровни', 'Momentum', 'Волатильность', 'Похожие паттерны на скриншоте', 'Торговый сценарий', 'Условия отмены сценария', 'Противоположный сценарий', 'Согласованность видимых признаков', 'Ограничения анализа'] },
};
function showModeDetails(mode) {
  const details = modeDetails[mode]; if (!details) return;
  $('#mode-title').textContent = `${mode.toUpperCase()} AI`;
  const box = $('#mode-details'); box.replaceChildren();
  box.append(uiNode('p', details.intro));
  const meter = uiNode('div', '', 'analysis-power');
  meter.append(uiNode('span', 'Уровень анализа'), uiNode('strong', `${details.power}%`));
  const track = uiNode('div', '', 'power-track'), fill = uiNode('i'); fill.style.width = `${details.power}%`; track.append(fill); meter.append(track); box.append(meter);
  const list = uiNode('ul'); details.points.forEach(point => list.append(uiNode('li', point))); box.append(list);
  box.append(uiNode('p', 'Это аспекты одного анализа, а не отдельные модели. Глубина ответа зависит от режима. Используются только данные скриншота.'));
  $('#mode-dialog').showModal();
}

function disableRegistration() {
  for (const link of document.querySelectorAll('[data-registration-link]')) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.title = 'Регистрация откроется после подключения проверки аккаунтов';
  }
}

function moscow(date = new Date(), withSeconds = false) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) }).format(date);
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
  $('#view-title').textContent = { dashboard: 'AI Анализ', history: 'История', level: 'Уровень', account: 'Профиль', settings: 'Настройки', 'owner-stats-view': 'Владелец' }[visibleView] || '';
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
window.addEventListener('popstate', () => routeFromStatus('replace'));
async function api(url, options = {}) {
  if (staticPreview) throw new Error('Доступ откроется после подключения Cloudflare Workers. Сейчас доступен только просмотр сайта.');
  let response;
  try {
    response = await fetch(`${apiBase}${url}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  } catch {
    throw Object.assign(new Error('Соединение прервалось. Проверьте интернет и повторите попытку.'), { code: 'NETWORK_ERROR' });
  }
  const data = await response.json().catch(() => {
    throw Object.assign(new Error(response.status === 413 ? 'Сервер отклонил слишком большой файл.' : 'Сервер не вернул ответ анализа. Попробуйте ещё раз.'), { code: 'INVALID_SERVER_RESPONSE', status: response.status });
  });
  if (!response.ok) throw Object.assign(new Error(data.message || 'Не удалось выполнить запрос'), { code: data.code, status: response.status });
  return data;
}
async function refreshOwnerStats() {
  try {
    const stats = await api('/api/admin/stats');
    for (const field of ['accounts', 'active', 'registrations', 'deposits', 'analyses']) {
      $(`#owner-${field}`).textContent = new Intl.NumberFormat('ru-RU').format(stats[field]);
    }
    $('#owner-stats-message').textContent = `Обновлено: ${moscow(new Date(), true)} МСК`;
  } catch { $('#owner-stats-message').textContent = 'Статистика сейчас недоступна. Попробуйте обновить.'; }
}
function uiNode(tag, value = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function dateLabel(timestamp) {
  if (!timestamp) return 'Нет данных';
  const date = new Date(timestamp);
  const today = new Date(Date.now() - state.clockOffset);
  if (date.toDateString() === today.toDateString()) return `сегодня ${moscow(date)}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `вчера ${moscow(date)}`;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function tierBadge(tier) {
  const badge = uiNode('span', tier || 'Без доступа', 'tier-badge');
  badge.style.setProperty('--tier-color', fallbackLevels.find(level => level.id === tier)?.color || '#8994A7');
  return badge;
}
async function refreshOwnerUsers(more = false) {
  if (!isOwner()) return;
  const page = more ? state.ownerPage + 1 : 0;
  const search = $('#owner-search').value.trim();
  if (search && !/^\d{1,16}$/.test(search)) { $('#owner-users-message').textContent = 'Введите только цифры ID.'; return; }
  $('#owner-users-message').textContent = 'Загружаем пользователей…';
  try {
    const data = await api(`/api/admin/users?q=${encodeURIComponent(search)}&filter=${state.ownerFilter}&page=${page}`);
    state.ownerPage = page;
    if (!more) $('#owner-users-body').replaceChildren();
    for (const user of data.users) {
      const row = document.createElement('tr'); row.tabIndex = 0; row.dataset.accountId = user.accountId;
      const values = [user.accountId, null, money(user.depositCents),
        user.creditsTotal === null ? 'Безлимит' : `${user.creditsRemaining} / ${user.creditsTotal}`,
        `${user.signalsUsed} / ${user.signalLimit === null ? '∞' : user.signalLimit}`,
        ['Fast', 'Deep', 'Maximum'].map(mode => `${user.aiUsage?.[mode]?.cycle || 0} ${mode}`).join(' · '),
        dateLabel(user.lastActiveAt), user.status === 'active' ? 'Активен' : 'Без доступа'];
      const labels = ['ID', 'Уровень', 'Депозиты', 'AI Credits', 'Сигналы', 'AI Usage', 'Последняя активность', 'Статус'];
      values.forEach((value, index) => {
        const cell = document.createElement('td'); cell.dataset.label = labels[index];
        cell.append(index === 1 ? tierBadge(user.tier) : document.createTextNode(value)); row.append(cell);
      });
      const actions = document.createElement('td'); actions.dataset.label = 'Действия';
      const reset = uiNode('button', 'Сбросить пароль', 'owner-row-reset');
      reset.type = 'button'; reset.dataset.resetPassword = user.accountId;
      reset.setAttribute('aria-label', `Сбросить пароль пользователя ID ${user.accountId}`);
      actions.append(reset);
      row.append(actions);
      $('#owner-users-body').append(row);
    }
    $('#owner-more').classList.toggle('hidden', !data.hasMore);
    $('#owner-users-message').textContent = data.users.length ? '' : more ? 'Больше пользователей нет.' : 'Пользователи не найдены.';
  } catch (error) { $('#owner-users-message').textContent = `Не удалось загрузить пользователей: ${error.message}`; }
}
function ownerDetailRow(label, value) {
  const item = uiNode('div'); item.append(uiNode('span', label), uiNode('strong', value)); return item;
}
function renderOwnerUser(data, appendSignals = false) {
  const user = data.user;
  state.ownerUserId = user.accountId;
  $('#owner-user-title').textContent = `Пользователь ID ${user.accountId}`;
  const box = $('#owner-user-content');
  if (!appendSignals) {
    box.replaceChildren();
    const fields = uiNode('div', '', 'owner-detail-grid');
    [
      ['Статус', user.status === 'active' ? 'Активен' : 'Без доступа'],
      ['Текущий уровень', user.tier || 'Не открыт'],
      ['Регистрация', dateLabel(user.registeredAt)], ['Проверка аккаунта', dateLabel(user.verifiedAt)],
      ['Общая сумма депозитов', money(user.depositCents)],
      ['AI Credits', user.creditsTotal === null ? 'Безлимит' : `${user.creditsRemaining} / ${user.creditsTotal}`],
      ['Credits использовано', `${user.creditsSpent || 0}`],
      ['Сигналы', `${user.signalsUsed} / ${user.signalLimit === null ? '∞' : user.signalLimit}`],
      ['Начало цикла', dateLabel(user.cycleStartedAt)], ['Обновление лимитов', dateLabel(user.cycleResetAt)],
      ['Последняя активность', dateLabel(user.lastActiveAt)],
      ['Следующий уровень', user.nextLevel || 'Максимальный уровень открыт'],
    ].forEach(([label, value]) => fields.append(ownerDetailRow(label, value)));
    box.append(fields);
    if (user.nextLevel) {
      box.append(uiNode('p', `До ${user.nextLevel} осталось ${money(Math.max(0, user.nextLevelDepositCents - user.depositCents))}. ${money(user.depositCents)} / ${money(user.nextLevelDepositCents)}`));
      const progress = document.createElement('progress'); progress.max = user.nextLevelDepositCents; progress.value = user.depositCents; box.append(progress);
    }
    const refresh = uiNode('button', 'Пересчитать по подтверждённым депозитам', 'button secondary');
    refresh.id = 'owner-user-refresh'; refresh.type = 'button'; box.append(refresh);
    const reset = uiNode('form', '', 'owner-password-reset'); reset.id = 'owner-password-reset';
    reset.append(uiNode('h3', 'Сбросить пароль пользователя'));
    const label = uiNode('label', 'Временный пароль BLUFIN+'); label.htmlFor = 'owner-temporary-password';
    const input = document.createElement('input'); input.id = 'owner-temporary-password'; input.type = 'password'; input.minLength = 10; input.required = true; input.autocomplete = 'new-password';
    const submit = uiNode('button', 'Сбросить пароль', 'button secondary'); submit.type = 'submit';
    const note = uiNode('p', 'После входа пользователь должен сменить этот пароль.', 'fine-print'); note.id = 'owner-reset-message';
    reset.append(label, input, submit, note); box.append(reset);
    box.append(uiNode('h3', 'Подтверждённые депозиты'));
    const deposits = uiNode('ul', '', 'owner-detail-list');
    for (const item of data.deposits) { const li = uiNode('li'); li.append(uiNode('span', dateLabel(item.confirmedAt)), uiNode('span', `${money(item.amountCents)} · Confirmed`)); deposits.append(li); }
    if (!data.deposits.length) deposits.append(uiNode('li', 'Депозитов пока нет'));
    box.append(deposits);
    box.append(uiNode('h3', 'Использование AI · период / всё время'));
    const usage = uiNode('ul', '', 'owner-detail-list');
    for (const mode of ['Fast', 'Deep', 'Maximum']) { const li = uiNode('li'); li.append(uiNode('span', mode), uiNode('span', `${data.aiUsage?.[mode]?.cycle || 0} / ${data.aiUsage?.[mode]?.lifetime || 0}`)); usage.append(li); }
    box.append(usage, uiNode('h3', 'Последние сигналы'));
    box.append(uiNode('ul', '', 'owner-detail-list')); box.lastElementChild.id = 'owner-signals-list';
  }
  const list = $('#owner-signals-list');
  if (!appendSignals && !data.signals.length) list.append(uiNode('li', 'Сигналов пока нет'));
  for (const signal of data.signals) {
    const li = uiNode('li');
    const direction = { UP: 'ВВЕРХ', DOWN: 'ВНИЗ' }[signal.verdict] || signal.verdict;
    li.append(uiNode('span', `${signal.pair} · ${(signal.mode || 'Fast').toUpperCase()} · ${direction}`),
      uiNode('span', `${dateLabel(signal.createdAt)} · ${signal.expiresAt && signal.expiresAt > Date.now() - state.clockOffset ? 'Активен' : 'Завершён'}`));
    list.append(li);
  }
  $('#owner-more-signals')?.remove();
  if (data.hasMoreSignals) { const more = uiNode('button', 'Показать больше', 'button secondary'); more.id = 'owner-more-signals'; more.dataset.page = String(data.signalPage + 1); box.append(more); }
}
async function openOwnerUser(accountId) {
  if (!isOwner()) return;
  $('#owner-user-content').textContent = 'Загружаем данные…';
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
    if (account.serverTime) state.clockOffset = Date.now() - account.serverTime;
    if (account.status === 'active') updateTerminalAccount();
    if (navigate && changed) routeFromStatus();
    if (!navigate && changed && !preserveHistory && ['active', 'guest'].includes(account.status)) routeFromStatus();
    if (account.status === 'deposit') updateActivation();
    return account;
  } catch {
    if (!navigate) $('#deposit-message').textContent = 'Не удалось проверить статус. Повторите попытку чуть позже.';
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
    $('#global-message').textContent = `Не удалось выйти: ${error.message}. Повторите попытку.`;
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
  heading.textContent = screenshotIssue ? 'Не удалось распознать данные графика' : 'Анализ не завершился';
  const description = document.createElement('span');
  description.textContent = screenshotIssue
    ? (error.message || 'Попробуйте загрузить другой скриншот графика.')
    : error.code === 'AI_INVALID_RESPONSE'
      ? 'Ответ не был готов. AI Credits за этот запрос не списаны. Попробуйте повторить анализ.'
      : (error.message || 'Попробуйте повторить анализ. AI Credits за неудачный запрос не списываются.');
  const action = document.createElement('button');
  action.type = 'button'; action.className = 'button secondary';
  action.textContent = screenshotIssue ? 'Заменить изображение' : 'Повторить анализ';
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
    return message($('#analysis-error'), 'Выберите изображение JPG, PNG, WebP, HEIC или HEIF.');
  if (file.size > 50_000_000) return message($('#analysis-error'), 'Не удалось обработать изображение размером больше 50 МБ.');
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
    } catch { throw Object.assign(new Error('Не удалось преобразовать HEIC/HEIF. Выберите другой файл.'), { code: 'IMAGE_DECODE_FAILED' }); }
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
    catch { URL.revokeObjectURL(objectUrl); throw Object.assign(new Error('Браузер не смог прочитать изображение. Выберите другой файл.'), { code: 'IMAGE_DECODE_FAILED' }); }
  }
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw Object.assign(new Error('Изображение пустое или повреждено.'), { code: 'IMAGE_DECODE_FAILED' });
    const scale = Math.min(1, 3200 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    const maxLength = 15_900_000; // Leave room for the small history preview in the JSON request.
    for (const ratio of [1, .9, .8, .7, .6]) {
      canvas.width = Math.max(1, Math.round(width * scale * ratio));
      canvas.height = Math.max(1, Math.round(height * scale * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw Object.assign(new Error('Браузер не смог подготовить изображение.'), { code: 'IMAGE_DECODE_FAILED' });
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
    throw Object.assign(new Error('Не удалось подготовить изображение для анализа.'), { code: 'IMAGE_DECODE_FAILED' });
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
    Fast: ['График получен', 'Распознавание пары, цены и таймфрейма', 'Тренд и базовая структура', 'Формирование сигнала'],
    Deep: ['График получен', 'Распознавание рынка', 'Структура и тренд', 'Momentum и volatility', 'Паттерны на видимом графике', 'Финальная проверка и сигнал'],
    Maximum: ['График получен', 'Распознавание рынка', 'Расширенная структура', 'Momentum и volatility', 'Сходство видимых паттернов', 'Проверка противоположного сценария', 'Согласованность признаков и сигнал'],
  }[mode];
  $('#processing-mode').textContent = `${mode.toUpperCase()} AI ACTIVE`;
  $('#processing-power').textContent = `${modeDetails[mode].power}%`;
  $('#processing-power-fill').style.width = `${modeDetails[mode].power}%`;
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
  if (!['UP', 'DOWN'].includes(data?.result?.verdict)) throw new Error('Сервер не сформировал сигнал. Повторите анализ позже.');
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
  $('#toggle-analysis').textContent = 'Подробный анализ';
  $('#toggle-analysis').setAttribute('aria-expanded', 'false');
  $('#signal-timer').classList.toggle('hidden', !actionable);
  $('#signal-status').textContent = 'СИГНАЛ АКТИВЕН';
  $('#signal-stamp').textContent = `${moscow(new Date(data.created_at), true)} МСК`;
  for (const [id, value] of Object.entries({
    pair: r.pair || data.asset, timeframe: r.timeframe || 'Не определён',
    price: r.current_price || 'Не определена',
    direction: { UP: 'ВВЕРХ', DOWN: 'ВНИЗ' }[r.verdict],
    duration: `${data.signalDuration / 60} мин`,
    mode: (data.mode || 'Fast').toUpperCase(),
  })) $(`#signal-${id}`).textContent = value;
  for (const field of ['trend', 'structure', 'momentum', 'volatility', 'historical_match', 'ai_consensus', 'key_levels', 'invalidation', 'limitations', 'final_conclusion'])
    $(`#report-${field}`).textContent = r[field] || (field === 'final_conclusion' ? r.reason : 'Не определено');
  showTerminal('result');
  if (state.resultTimer) clearInterval(state.resultTimer);
  state.resultTimer = null;
  if (actionable) {
    const update = () => {
      const seconds = Math.max(0, Math.ceil((data.signalExpiresAt - (Date.now() - state.clockOffset)) / 1000));
      const total = data.signalDuration || 1;
      $('#timer-text').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      $('#signal-timer').style.setProperty('--progress', `${Math.min(100, seconds / total * 100)}%`);
      $('#timer-label').textContent = seconds ? 'СИГНАЛ АКТИВЕН' : 'СИГНАЛ ЗАВЕРШЁН';
      $('#signal-status').textContent = seconds ? 'СИГНАЛ АКТИВЕН' : 'СИГНАЛ ЗАВЕРШЁН';
      panel.classList.toggle('expired', !seconds);
      if (!seconds && state.resultTimer) { clearInterval(state.resultTimer); state.resultTimer = null; }
    };
    update();
    if (data.signalExpiresAt > Date.now() - state.clockOffset) state.resultTimer = setInterval(update, 1000);
  } else {
    $('#signal-actions').classList.remove('hidden');
    $('#signal-analysis').classList.add('hidden');
    $('#toggle-analysis').textContent = 'Подробный анализ';
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
  $('#level-current').style.color = current?.color || '#8994A7';
  $('#level-next').textContent = next ? `До ${next.id} осталось ${money(Math.max(0, next.minDeposit - account.depositCents))}` : 'Максимальный уровень открыт';
  $('#level-progress').classList.toggle('hidden', !next);
  if (next) { $('#level-progress').max = next.minDeposit; $('#level-progress').value = account.depositCents; }
  renderLevelTrack();
  const benefits = $('#level-benefits'); benefits.replaceChildren();
  for (const level of levels()) {
    const row = uiNode('button', '', 'level-benefit'); row.type = 'button'; row.dataset.levelInfo = level.id;
    row.style.setProperty('--level-color', level.color);
    row.append(uiNode('strong', level.id), uiNode('span', `${level.signalLimit ?? '∞'} сигналов · ${level.creditsLimit} AI Credits · ${level.availableAiModes.map(mode => mode.toUpperCase()).join(' / ')}`), uiNode('span', '›'));
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
  if (!more) { state.historyItems = []; $('#history-list').textContent = 'Загружаем историю…'; }
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
    if (!more) $('#history-list').textContent = `Не удалось загрузить историю: ${error.message}`;
    else $('#history-more').textContent = 'Повторить загрузку';
  } finally {
    if (requestId === state.historyRequestId) { state.historyLoading = false; $('#history-more').disabled = false; }
  }
}
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren();
  if (!state.historyItems.length) {
    const empty = uiNode('div', '', 'history-empty');
    empty.append(uiNode('span', '◷', 'empty-icon'), uiNode('h2', 'Анализов пока нет'), uiNode('p', 'Загрузите график, чтобы получить первый результат.'));
    const action = uiNode('button', 'Начать анализ', 'button primary'); action.type = 'button'; action.addEventListener('click', () => navigate('dashboard')); empty.append(action); list.append(empty);
  }
  for (const item of state.historyItems) {
    const row = uiNode('button', '', 'history-row'); row.type = 'button'; row.dataset.historyId = item.id;
    const direction = item.result?.verdict === 'DOWN' ? 'Вниз' : 'Вверх';
    const meta = uiNode('span', new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at)), 'history-date');
    const main = uiNode('span', '', 'history-row-main');
    main.append(uiNode('strong', item.result?.pair || item.asset || 'График'), uiNode('span', direction, item.result?.verdict === 'DOWN' ? 'direction-down' : 'direction-up'), uiNode('small', `${(item.mode || 'Fast').toUpperCase()} AI`));
    row.append(meta, main, uiNode('span', item.result?.final_conclusion || item.result?.reason || 'Открыть анализ', 'history-summary'));
    if (locationView().recordId === item.id) row.classList.add('selected');
    list.append(row);
  }
  $('#history-more').classList.toggle('hidden', !state.historyHasMore);
  $('#history-more').textContent = 'Показать ещё';
  const chips = $('#history-chips'); chips.replaceChildren();
  for (const [name, value] of Object.entries({ q: state.historyQuery, ...state.historyFilters })) if (value) chips.append(uiNode('span', `${{ q: 'Поиск', date: 'Дата', mode: 'Режим', direction: 'Направление' }[name]}: ${value}`));
}
function closeHistoryDetail() {
  $('#history-detail').classList.add('hidden');
  $('#history').classList.remove('detail-open');
}
async function openHistoryDetail(id) {
  if (!id) return;
  const panel = $('#history-detail'); const body = $('#history-detail-body');
  panel.classList.remove('hidden'); $('#history').classList.add('detail-open');
  body.textContent = 'Загружаем анализ…';
  try {
    const item = (await api(`/api/history/${encodeURIComponent(id)}`)).analysis;
    if (locationView().recordId !== id) return;
    body.replaceChildren();
    if (item.preview) {
      const image = document.createElement('img'); image.src = item.preview; image.alt = 'Миниатюра графика'; image.className = 'history-preview';
      image.addEventListener('click', () => showPreview(item.preview)); body.append(image);
    }
    body.append(uiNode('span', new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(item.created_at)), 'history-date'));
    body.append(uiNode('h2', `${item.result?.pair || item.asset} · ${item.result?.verdict === 'DOWN' ? 'Вниз' : 'Вверх'}`));
    body.append(uiNode('p', `${(item.mode || 'Fast').toUpperCase()} AI · ${item.result?.timeframe || 'Таймфрейм не определён'} · ${item.result?.current_price || 'Цена не определена'}`, 'history-detail-meta'));
    body.append(uiNode('p', item.result?.final_conclusion || item.result?.reason || '', 'history-conclusion'));
    const dl = uiNode('dl', '', 'history-report');
    for (const [field, label] of Object.entries({ trend: 'Тренд', structure: 'Структура', momentum: 'Momentum', volatility: 'Volatility', historical_match: 'Historical Match', ai_consensus: 'AI Consensus', key_levels: 'Уровни', invalidation: 'Отмена сценария', limitations: 'Ограничения' })) {
      if (!item.result?.[field]) continue;
      const row = uiNode('div'); row.append(uiNode('dt', label), uiNode('dd', item.result[field])); dl.append(row);
    }
    body.append(dl);
    renderHistory();
  } catch (error) { if (locationView().recordId === id) body.textContent = `Не удалось открыть анализ: ${error.message}`; }
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
async function init() {
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
    message($('#register-message'), 'Регистрация откроется после подключения Cloudflare Workers.');
  }
  try {
    state.config = await api('/api/config');
    const expiryReady = state.config.analysisApiVersion >= 2;
    $('#expiry-options').classList.toggle('hidden', !expiryReady);
    $('.expiry-heading').classList.toggle('hidden', !expiryReady);
    renderLevels();
    if (!state.config.attributionConfigured) {
      message($('#id-message'), 'Проверка аккаунтов ещё настраивается. Регистрация через BLUFIN+ откроется после подключения postback.');
      message($('#register-message'), 'Регистрация временно недоступна. Повторите попытку позже.');
      disableRegistration();
    } else {
      for (const link of document.querySelectorAll('[data-registration-link]')) link.href = `${apiBase}/go`;
      document.querySelector('#deposit a.button').href = `${apiBase}/go`;
    }
  } catch {
    disableRegistration();
    message($('#register-message'), 'Сервер проверки сейчас недоступен. Регистрация временно отключена.');
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
    $('#auth-loading-message').textContent = 'Не удалось проверить сессию. Проверьте соединение и повторите.';
    $('#auth-retry').classList.remove('hidden');
  }
  $('.brand').addEventListener('click', event => { event.preventDefault(); navigate(state.status === 'active' ? 'dashboard' : 'landing'); });
  document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.route)));
  $('#sidebar-collapse').addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    $('#sidebar-collapse').setAttribute('aria-expanded', String(!collapsed));
    $('#sidebar-collapse').setAttribute('aria-label', collapsed ? 'Развернуть панель' : 'Свернуть панель');
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
    if (password !== $('#setup-confirm').value) return message($('#setup-message'), 'Пароли не совпадают.');
    const button = $('#setup-form button[type=submit]'); button.disabled = true;
    try {
      const result = await api('/api/auth/setup', { method: 'POST', body: JSON.stringify({ password }) });
      $('#setup-form').reset(); acceptAuth(result);
    } catch (error) {
      message($('#setup-message'), error.code === 'ACCOUNT_EXISTS'
        ? 'Пароль уже создан. Выйдите и войдите с этим паролем.' : error.message);
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
    if (newPassword !== $('#new-password-confirm').value) return message($('#change-password-message'), 'Новые пароли не совпадают.');
    const button = $('#change-password-form button[type=submit]'); button.disabled = true;
    try {
      const result = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword }) });
      $('#change-password-form').reset(); $('#change-password-dialog').close();
      acceptAuth(result); message($('#security-message'), 'Пароль успешно изменён.', false);
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
      message($('#security-message'), 'Вход владельца перенесён на ID и пароль.', false);
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
    if (!window.confirm(`Сбросить пароль пользователя ID ${state.ownerUserId}? Все его текущие сеансы завершатся.`)) return;
    const button = event.target.querySelector('button[type=submit]'); button.disabled = true;
    try {
      await api(`/api/admin/users/${state.ownerUserId}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword: $('#owner-temporary-password').value }) });
      event.target.reset();
      message($('#owner-reset-message'), 'Пароль изменён. Передайте временный пароль пользователю лично. При следующем входе потребуется его сменить.', false);
    } catch (error) { message($('#owner-reset-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#id-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#id-form button'); button.disabled = true; button.textContent = 'Проверяем…';
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
      message($('#id-message'), error.message + (error.code === 'ID_NOT_FOUND' ? ' Перейдите к регистрации на предыдущем шаге.' : ''));
      if (error.code === 'ACCOUNT_EXISTS') {
        const login = uiNode('button', 'Перейти ко входу', 'text-link'); login.type = 'button';
        login.addEventListener('click', () => navigate('login'), { once: true }); $('#id-message').append(login);
      }
    }
    finally { button.disabled = false; button.innerHTML = 'Проверить аккаунт <span aria-hidden="true">→</span>'; }
  });
  $('#check-deposit').addEventListener('click', async () => {
    const button = $('#check-deposit'); button.disabled = true;
    $('#deposit-message').textContent = 'Проверяем статус…';
    try {
      const account = await api('/api/activation/check', { method: 'POST' });
      state.account = account; state.status = account.status; state.accountId = account.accountId;
      if (account.status === 'active') routeFromStatus();
      else { updateActivation(); $('#deposit-message').textContent = `Доступ ещё не активирован. Для BASE нужна общая сумма подтверждённых депозитов от $20. Сейчас ${money(account.depositCents)}.`; }
    } catch (error) { $('#deposit-message').textContent = error.message; }
    button.disabled = false;
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
    setFile(new File([image], image.name || 'Вставленный скриншот.png', { type: image.type }));
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
    $('#toggle-analysis').textContent = hidden ? 'Подробный анализ' : 'Скрыть анализ';
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
    if (!state.file) return message($('#analysis-error'), 'Сначала загрузите скриншот графика.');
    if (!state.account?.modes?.includes(state.mode) && state.role !== 'admin' && !state.account?.special)
      return message($('#analysis-error'), 'Этот режим недоступен на вашем уровне.');
    const button = $('#analyze-button'); button.disabled = true; button.textContent = 'Анализируем график…';
    $('#analysis-error').classList.add('hidden');
    beginProcessing(state.mode);
    let sentAt = null;
    try {
      const image = await imageDataUrl(state.file);
      const preview = await createPreview(image);
      imagePrepared();
      sentAt = Date.now();
      const result = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ image, preview, mode: state.mode, expiry: state.expiry }) });
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
    } finally { button.disabled = false; button.innerHTML = 'НАЧАТЬ АНАЛИЗ <span aria-hidden="true">↗</span>'; }
  });
}
init();
