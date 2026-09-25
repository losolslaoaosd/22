const $ = selector => document.querySelector(selector);
const state = { status: 'guest', role: null, accountId: null, account: null, file: null, mode: 'Fast', config: null, polling: null, resultTimer: null, latestResult: null, dismissedResultId: null, clockOffset: 0, ownerFilter: 'all', ownerPage: 0, ownerUserId: null, token: sessionStorage.getItem('blufin_session') };
const views = ['landing', 'register', 'access', 'deposit', 'dashboard', 'owner-stats-view'];
const apiBase = (window.BLUFIN_API_BASE || '').replace(/\/$/, '');
const staticPreview = window.BLUFIN_STATIC_PREVIEW === true && !apiBase;
const fallbackLevels = [
  { id: 'BASE', minDeposit: 2000, signalLimit: 3, creditsLimit: 30, availableAiModes: ['Fast'], color: '#6B7280' },
  { id: 'PLUS', minDeposit: 5000, signalLimit: 10, creditsLimit: 300, availableAiModes: ['Fast', 'Deep'], color: '#2563EB' },
  { id: 'PRO', minDeposit: 7500, signalLimit: 30, creditsLimit: 1000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#7C3AED' },
  { id: 'ADVANCED', minDeposit: 10000, signalLimit: 70, creditsLimit: 3000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#EF4444' },
  { id: 'ULTRA', minDeposit: 20000, signalLimit: null, creditsLimit: 10000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#F5B942' },
];
function levels() { return state.config?.levels?.length === 5 ? state.config.levels : fallbackLevels; }
function renderLevels() {
  const cards = levels().map(level => {
    const card = document.createElement('article');
    card.className = 'level-card'; card.dataset.tier = level.id;
    card.style.setProperty('--level-color', fallbackLevels.find(item => item.id === level.id)?.color || '#6B7280');
    const title = document.createElement('h3'); title.textContent = level.id;
    const price = document.createElement('strong'); price.className = 'level-price'; price.textContent = `от ${money(level.minDeposit)}`;
    const signals = document.createElement('strong'); signals.className = 'level-signals';
    signals.textContent = level.signalLimit === null ? 'Безлимит' : `${level.signalLimit} ${level.signalLimit === 3 ? 'сигнала' : 'сигналов'} / 24 ч`;
    const extra = document.createElement('div'); extra.className = 'level-extra';
    extra.textContent = `${level.creditsLimit} AI Credits · ${level.availableAiModes.length === 3 ? 'Все режимы' : level.availableAiModes.length === 2 ? 'Fast + Deep' : 'Fast AI'}`;
    card.append(title, price, signals, extra); return card;
  });
  $('#public-level-cards').replaceChildren(...cards);
  $('#activation-levels').replaceChildren(...cards.map(card => card.cloneNode(true)));
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

const siteRoot = new URL(window.location.pathname.replace(/(?:app|owner)\/(?:index\.html)?$|index\.html$/, ''), window.location.origin);
const section = window.location.pathname.match(/\/(app|owner)\/(?:index\.html)?$/)?.[1] || null;
function sectionUrl(name) { return new URL(`${name}/`, siteRoot).href; }
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
  const tint = fallbackLevels.find(level => level.id === a.tier)?.color || '#6B7280';
  $('#account-widget').style.setProperty('--tier-color', tint);
  $('#summary-tier').textContent = a.role === 'admin' ? 'ВЛАДЕЛЕЦ' : a.tier || 'BASE';
  $('#summary-credits').textContent = a.creditsTotal === null ? 'AI Credits ∞' : `${a.creditsRemaining} AI Credits`;
  $('#summary-signals').textContent = `${a.signalsUsed || 0}/${a.signalLimit === null ? '∞' : a.signalLimit}`;
  $('#summary-next').textContent = a.nextLevel && a.role !== 'admin' ? `До ${a.nextLevel}: ${money(Math.max(0, a.nextLevelDepositCents - a.depositCents))}` : '';
  $('#status-tier').textContent = a.tier || 'Нет уровня';
  $('#status-rank').textContent = a.role === 'admin' ? 'Владелец' : `Уровень ${rank || 1}`;
  $('#status-deposits').textContent = a.role === 'admin' ? 'Личный доступ' : money(a.depositCents);
  $('#status-credits').textContent = a.creditsTotal === null ? 'Безлимит' : `${a.creditsRemaining} / ${a.creditsTotal}`;
  $('#status-signals').textContent = `${a.signalsUsed || 0} / ${a.signalLimit === null ? '∞' : a.signalLimit}`;
  $('#status-next').classList.toggle('hidden', !a.nextLevel || a.role === 'admin');
  $('#status-max').classList.toggle('hidden', Boolean(a.nextLevel) || a.role === 'admin');
  $('#status-cycle-note').classList.toggle('hidden', Boolean(a.cycleResetAt));
  if (a.nextLevel) {
    $('#status-next-text').textContent = `До ${a.nextLevel}: ${money(Math.max(0, a.nextLevelDepositCents - a.depositCents))}`;
    const current = state.config?.levels?.find(level => level.id === a.tier)?.minDeposit || 0;
    $('#status-progress').value = Math.min(100, 100 * Math.max(0, (a.depositCents - current) / (a.nextLevelDepositCents - current)));
  }
  if (!a.nextLevel && a.role !== 'admin') $('#status-reset').title = 'Максимальный уровень открыт';
  $('#upgrade-link').textContent = a.tier === 'ULTRA' || a.role === 'admin' ? 'ULTRA • MAX LEVEL' : 'Повысить уровень';
  $('#status-upgrade').classList.toggle('hidden', !a.nextLevel || a.role === 'admin');
  updateCycleTime();
  updateModes();
}
function openUpgrade() {
  const a = state.account;
  if (!a || a.role === 'admin' || a.tier === 'ULTRA') return;
  const next = state.config?.levels?.find(level => level.id === a.nextLevel);
  if (!next) return;
  const box = $('#upgrade-content'); box.replaceChildren();
  const line = (label, value) => { const row = document.createElement('p'); row.className = 'upgrade-row';
    const caption = document.createElement('span'); caption.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value; row.append(caption, strong); box.append(row); };
  line('Ваш уровень', a.tier);
  line('Общая сумма депозитов', money(a.depositCents));
  line('Следующий уровень', next.name);
  line('До повышения осталось', money(Math.max(0, next.minDeposit - a.depositCents)));
  const progress = document.createElement('progress'); progress.max = next.minDeposit; progress.value = a.depositCents; box.append(progress);
  const benefit = document.createElement('p'); benefit.className = 'upgrade-benefits';
  benefit.textContent = `${next.signalLimit ?? '∞'} сигналов / 24 ч · ${next.creditsLimit} AI Credits · ${next.availableAiModes.join(' / ')}`;
  box.append(benefit);
  const link = document.createElement('a'); link.className = 'button primary'; link.textContent = `Повысить до ${next.name}`;
  link.href = `${apiBase}/go`; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
  $('#upgrade-dialog').showModal();
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
}
const modeDetails = {
  Fast: { power: 30, intro: 'Быстрый анализ основных параметров на загруженном скриншоте.', points: ['Видимый тренд и структура', 'Текущая цена и таймфрейм', 'Базовая оценка волатильности', 'Краткий вывод по видимым свечам'] },
  Deep: { power: 70, intro: 'Более подробный разбор того же графика и альтернативного сценария.', points: ['Тренд и несколько аспектов видимой структуры', 'Momentum и volatility по скриншоту', 'Похожие паттерны на видимом участке', 'Дополнительные аргументы за и против сигнала'] },
  Maximum: { power: 100, intro: 'Максимально подробный разбор доступных данных изображения.', points: ['Расширенная оценка видимой структуры', 'Momentum, volatility и похожие участки графика', 'Проверка противоположного сценария', 'Финальная согласованность видимых признаков'] },
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
  box.append(uiNode('p', 'Уровень анализа показывает глубину ответа. Все режимы используют только данные загруженного скриншота.'));
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
function show(view) {
  for (const name of views) $(`#${name}`).classList.toggle('hidden', name !== view);
  $('#onboarding-progress').classList.toggle('hidden', !['register', 'access', 'deposit'].includes(view));
  const stages = ['register', 'access', 'deposit'];
  for (const element of $('#onboarding-progress').querySelectorAll('[data-step]')) {
    element.classList.toggle('active', element.dataset.step === view);
    element.classList.toggle('completed', stages.indexOf(element.dataset.step) < stages.indexOf(view));
    if (element.dataset.step === view) element.setAttribute('aria-current', 'step');
    else element.removeAttribute('aria-current');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (state.polling) { clearInterval(state.polling); state.polling = null; }
  if (view === 'deposit') state.polling = setInterval(() => refreshSession(false), 10_000);
  $('#owner-stats-link').classList.toggle('hidden', state.role !== 'admin' || view !== 'dashboard');
  $('#upgrade-link').classList.toggle('hidden', view !== 'dashboard' || state.role === 'admin' || state.account?.tier === 'ULTRA');
  $('#account-widget').classList.toggle('hidden', state.status !== 'active');
  $('#account-chip').classList.add('hidden');
  $('#logout-button').classList.toggle('hidden', !state.token);
  if (view === 'owner-stats-view' && state.role === 'admin') { refreshOwnerStats(); refreshOwnerUsers(false); }
  if (view === 'dashboard') { updateTerminalAccount(); restoreLatest(); }
  if (view === 'deposit') updateActivation();
}
function routeFromStatus() {
  if (state.status === 'active') {
    if (section === 'owner' && state.role !== 'admin') return window.location.replace(sectionUrl('app'));
    if (!section) return window.location.replace(sectionUrl('app'));
    return show(section === 'owner' ? 'owner-stats-view' : 'dashboard');
  }
  if (section) return window.location.replace(siteRoot.href);
  show(state.status === 'deposit' ? 'deposit' : 'landing');
}
async function api(url, options = {}) {
  if (staticPreview) throw new Error('Доступ откроется после подключения Cloudflare Workers. Сейчас доступен только просмотр сайта.');
  const response = await fetch(`${apiBase}${url}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => { throw new Error('Сервер проверки сейчас недоступен.'); });
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
  badge.style.setProperty('--tier-color', fallbackLevels.find(level => level.id === tier)?.color || '#6B7280');
  return badge;
}
async function refreshOwnerUsers(more = false) {
  if (state.role !== 'admin') return;
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
    const direction = { UP: 'ВВЕРХ', DOWN: 'ВНИЗ', NO_TRADE: 'ПРОПУСК' }[signal.verdict] || signal.verdict;
    li.append(uiNode('span', `${signal.pair} · ${(signal.mode || 'Fast').toUpperCase()} · ${direction}`),
      uiNode('span', `${dateLabel(signal.createdAt)} · ${signal.expiresAt && signal.expiresAt > Date.now() - state.clockOffset ? 'Активен' : 'Завершён'}`));
    list.append(li);
  }
  $('#owner-more-signals')?.remove();
  if (data.hasMoreSignals) { const more = uiNode('button', 'Показать больше', 'button secondary'); more.id = 'owner-more-signals'; more.dataset.page = String(data.signalPage + 1); box.append(more); }
}
async function openOwnerUser(accountId) {
  if (state.role !== 'admin') return;
  $('#owner-user-content').textContent = 'Загружаем данные…';
  $('#owner-user-dialog').showModal();
  try { renderOwnerUser(await api(`/api/admin/users/${encodeURIComponent(accountId)}`)); }
  catch (error) { $('#owner-user-content').textContent = error.message; }
}
async function enterOwnerCode(code) {
  const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ code }) });
  state.token = result.token; state.status = 'active'; state.role = 'admin'; state.accountId = null;
  state.account = { status: 'active', role: 'admin', tier: 'ULTRA', modes: ['Fast', 'Deep', 'Maximum'] }; state.latestResult = null;
  sessionStorage.setItem('blufin_session', result.token);
  $('#account-id').value = '';
  await refreshSession(false);
  routeFromStatus();
}
async function refreshSession(navigate = true) {
  if (!state.token && apiBase) {
    state.status = 'guest'; state.accountId = null; state.role = null; state.account = null;
    if (navigate) routeFromStatus();
    return { status: 'guest' };
  }
  try {
    const account = await api('/api/me');
    if (account.status === 'guest') { state.token = null; sessionStorage.removeItem('blufin_session'); }
    const changed = account.status !== state.status;
    state.status = account.status;
    state.accountId = account.accountId || null;
    state.role = account.role || null; state.account = account;
    if (account.serverTime) state.clockOffset = Date.now() - account.serverTime;
    if (account.status === 'active') updateTerminalAccount();
    if (navigate && changed) routeFromStatus();
    if (!navigate && changed && account.status === 'active') routeFromStatus();
    if (account.status === 'deposit') updateActivation();
    return account;
  } catch {
    if (!navigate) $('#deposit-message').textContent = 'Не удалось проверить статус. Повторите попытку чуть позже.';
  }
}
function message(node, text, isError = true) {
  node.classList.remove('hidden');
  node.style.color = isError ? '' : '#a6eeda';
  node.style.background = isError ? '' : '#163a3c';
  node.style.borderColor = isError ? '' : '#2f746b';
  node.textContent = text;
}
function setFile(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return message($('#analysis-error'), 'Нужен скриншот в формате JPG, PNG или WebP.');
  if (file.size > 5_000_000) return message($('#analysis-error'), 'Файл должен быть меньше 5 МБ.');
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = file;
  state.previewUrl = URL.createObjectURL(file);
  $('#preview-img').src = state.previewUrl;
  $('#preview-name').textContent = file.name;
  $('#image-preview').classList.remove('hidden');
  $('#empty-upload').classList.add('hidden');
  $('#analysis-error').classList.add('hidden');
}
async function imageDataUrl(file) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally { image.close(); }
}
function showTerminal(section) {
  for (const [name, id] of Object.entries({ empty: 'terminal-empty', processing: 'terminal-processing', result: 'terminal-result' }))
    $(`#${id}`).classList.toggle('hidden', name !== section);
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
  if (data.serverTime) state.clockOffset = Date.now() - data.serverTime;
  state.latestResult = { ...data, serverTime: undefined };
  state.dismissedResultId = null;
  const r = data.result;
  const actionable = ['UP', 'DOWN'].includes(r.verdict) && Boolean(data.signalExpiresAt);
  const panel = $('#terminal-result');
  panel.classList.toggle('no-trade', !actionable);
  panel.classList.remove('expired');
  $('#signal-actions').classList.add('hidden');
  $('#signal-analysis').classList.remove('hidden');
  $('#signal-timer').classList.toggle('hidden', !actionable);
  $('#signal-status').textContent = actionable ? 'СИГНАЛ АКТИВЕН' : 'СИГНАЛ НЕ СФОРМИРОВАН';
  $('#signal-stamp').textContent = `${moscow(new Date(data.created_at), true)} МСК`;
  for (const [id, value] of Object.entries({
    pair: r.pair || data.asset, timeframe: r.timeframe || 'Не определён',
    price: r.current_price || 'Не определена',
    direction: { UP: 'ВВЕРХ', DOWN: 'ВНИЗ', NO_TRADE: 'ПРОПУСТИТЬ' }[r.verdict],
    duration: actionable ? `${data.signalDuration / 60} мин` : 'Нет сигнала',
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
      if (!seconds && $('#signal-actions').classList.contains('hidden')) {
        $('#signal-actions').classList.remove('hidden');
        $('#signal-analysis').classList.add('hidden');
        $('#toggle-analysis').textContent = 'Открыть разбор';
      }
      if (!seconds && state.resultTimer) { clearInterval(state.resultTimer); state.resultTimer = null; }
    };
    update();
    if (data.signalExpiresAt > Date.now() - state.clockOffset) state.resultTimer = setInterval(update, 1000);
  } else {
    $('#signal-actions').classList.remove('hidden');
    $('#signal-analysis').classList.add('hidden');
    $('#toggle-analysis').textContent = 'Открыть разбор';
  }
  if (scroll) $('#signal-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function restoreLatest() {
  if (state.latestResult) return renderResult(state.latestResult);
  try {
    const history = await api('/api/history');
    if (!$('#dashboard').classList.contains('hidden') && history.analyses?.[0] && history.analyses[0].id !== state.dismissedResultId && $('#terminal-processing').classList.contains('hidden'))
      renderResult({ ...history.analyses[0], serverTime: history.serverTime });
  } catch { /* A missing history must not block a new analysis. */ }
}
async function init() {
  renderLevels();
  if (staticPreview) {
    $('#preview-banner').classList.remove('hidden');
    disableRegistration();
    $('#register-message').textContent = 'Регистрация откроется после подключения Cloudflare Workers.';
  }
  try {
    state.config = await api('/api/config');
    renderLevels();
    if (!state.config.attributionConfigured) {
      message($('#id-message'), 'Проверка аккаунтов ещё настраивается. Регистрация через BLUFIN+ откроется после подключения postback.');
      $('#register-message').textContent = 'Регистрация временно недоступна. Повторите попытку позже.';
      disableRegistration();
    } else {
      for (const link of document.querySelectorAll('[data-registration-link]')) link.href = `${apiBase}/go`;
      const depositLink = document.querySelector('#deposit a.button');
      depositLink.href = `${apiBase}/go`;
    }
    await refreshSession(false);
    routeFromStatus();
  } catch {
    disableRegistration();
    $('#register-message').textContent = 'Сервер проверки сейчас недоступен. Регистрация временно отключена.';
    message($('#id-message'), 'Сервер проверки сейчас недоступен. Проверка ID временно отключена.', false);
    show('landing');
  }
  $('#begin-button').addEventListener('click', () => show('register'));
  $('#go-to-verification').addEventListener('click', () => show('access'));
  $('#back-to-registration').addEventListener('click', () => show('register'));
  $('#continue-activation').addEventListener('click', () => show('deposit'));
  $('#owner-stats-link').addEventListener('click', () => window.location.assign(sectionUrl('owner')));
  $('#upgrade-link').addEventListener('click', openUpgrade);
  $('#account-summary').addEventListener('click', async () => {
    const popover = $('#account-status');
    const opening = popover.classList.contains('hidden');
    popover.classList.toggle('hidden', !opening);
    $('#account-summary').setAttribute('aria-expanded', String(opening));
    if (opening) await refreshSession(false);
  });
  document.addEventListener('click', event => {
    if (!$('#account-widget').contains(event.target)) {
      $('#account-status').classList.add('hidden');
      $('#account-summary').setAttribute('aria-expanded', 'false');
    }
  });
  $('#status-upgrade').addEventListener('click', () => { $('#account-status').classList.add('hidden'); $('#account-summary').setAttribute('aria-expanded', 'false'); openUpgrade(); });
  $('#close-upgrade').addEventListener('click', () => $('#upgrade-dialog').close());
  $('#upgrade-dialog').addEventListener('click', event => { if (event.target.id === 'upgrade-dialog') event.target.close(); });
  setInterval(updateCycleTime, 30_000);
  $('#back-terminal').addEventListener('click', () => window.location.assign(sectionUrl('app')));
  $('#logout-button').addEventListener('click', () => {
    state.token = null; state.status = 'guest'; state.role = null; state.accountId = null;
    sessionStorage.removeItem('blufin_session');
    state.latestResult = null; if (state.resultTimer) clearInterval(state.resultTimer);
    state.resultTimer = null; showTerminal('empty');
    routeFromStatus();
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
  $('#owner-users-body').addEventListener('click', event => { const row = event.target.closest('[data-account-id]'); if (row) openOwnerUser(row.dataset.accountId); });
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
      let result;
      try {
        result = await api('/api/claim', { method: 'POST', body: JSON.stringify({ accountId: value }) });
      } catch (claimError) {
        if (claimError.status >= 400 && claimError.status < 500 && claimError.status !== 429) {
          try {
            await enterOwnerCode(value);
            return;
          } catch (ownerError) {
            if (![400, 401, 403, 404].includes(ownerError.status)) throw ownerError;
          }
        }
        throw claimError;
      }
      if (result.token) { state.token = result.token; sessionStorage.setItem('blufin_session', result.token); }
      state.status = result.status; state.accountId = result.accountId; state.role = null; state.account = result; state.latestResult = null;
      if (result.status === 'active') routeFromStatus();
      else { updateActivation(); message($('#id-message'), 'Аккаунт найден · ID подтверждён', false); $('#continue-activation').classList.remove('hidden'); }
    } catch (error) { message($('#id-message'), error.message + (error.code === 'ID_NOT_FOUND' ? ' Перейдите к регистрации на предыдущем шаге.' : '')); }
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
  $('#remove-file').addEventListener('click', e => {
    e.stopPropagation(); state.file = null; $('#chart-file').value = '';
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    $('#image-preview').classList.add('hidden'); $('#empty-upload').classList.remove('hidden');
  });
  $('#mode-options').addEventListener('click', e => {
    const info = e.target.closest('[data-mode-info]'); if (info) return showModeDetails(info.dataset.modeInfo);
    const card = e.target.closest('[data-mode]'); if (!card) return;
    if (card.getAttribute('aria-disabled') === 'true') {
      return message($('#analysis-error'), card.querySelector('.mode-lock').textContent);
    }
    state.mode = card.dataset.mode; updateModes(); $('#analysis-error').classList.add('hidden');
  });
  $('#toggle-analysis').addEventListener('click', () => {
    const hidden = $('#signal-analysis').classList.toggle('hidden');
    $('#toggle-analysis').textContent = hidden ? 'Открыть разбор' : 'Скрыть разбор';
  });
  $('#new-analysis').addEventListener('click', () => {
    state.dismissedResultId = state.latestResult?.id || null;
    state.latestResult = null; state.mode = 'Fast'; updateModes();
    if (state.resultTimer) clearInterval(state.resultTimer); state.resultTimer = null;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null; state.file = null; $('#chart-file').value = ''; $('#preview-img').removeAttribute('src');
    $('#image-preview').classList.add('hidden'); $('#empty-upload').classList.remove('hidden');
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
    try {
      const image = await imageDataUrl(state.file);
      if (image.length > 4_700_000) throw new Error('Изображение слишком большое. Загрузите более компактный скриншот.');
      imagePrepared();
      const result = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ image, mode: state.mode }) });
      renderResult(result, true);
      if (result.account) { state.account = result.account; updateTerminalAccount(); }
    } catch (error) {
      showTerminal(state.latestResult ? 'result' : 'empty');
      message($('#analysis-error'), error.message);
      $('#analysis-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally { button.disabled = false; button.innerHTML = 'НАЧАТЬ АНАЛИЗ <span aria-hidden="true">↗</span>'; }
  });
}
init();
