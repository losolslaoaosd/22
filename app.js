Warning: truncated output (original token count: 14570)
Total output lines: 845

const $ = selector => document.querySelector(selector);
const state = { status: 'guest', role: null, accountId: null, account: null, file: null, mode: 'Fast', config: null, polling: null, resultTimer: null, latestResult: null, dismissedResultId: null, clockOffset: 0, ownerFilter: 'all', ownerPage: 0, ownerUserId: null, token: sessionStorage.getItem('blufin_session') };
const views = ['landing', 'login', 'register', 'access', 'password-setup', 'deposit', 'dashboard', 'account', 'owner-stats-view'];
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

const siteRoot = new URL(window.location.pathname.replace(/(?:app|owner|account)\/(?:index\.html)?$|index\.html$/, ''), window.location.origin);
const section = window.location.pathname.match(/\/(app|owner|account)\/(?:index\.html)?$/)?.[1] || null;
function sectionUrl(name) { return new URL(`${name}/`, siteRoot).href; }
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
  const tint = fallbackLevels.find(level => level.id === a.tier)?.color || '#6B7280';
  $('#account-widget').style.setProperty('--tier-color', tint);
  $('#summary-tier').textContent = isOwner() ? 'ПРОФИЛЬ' : a.tier || 'BASE';
  $('#summary-credits').textContent = a.creditsTotal === null ? 'AI Credits ∞' : `${a.creditsRemaining} AI Credits`;
  $('#summary-signals').textContent = `${a.signalsUsed || 0}/${a.signalLimit === null ? '∞' : a.signalLimit}`;
  $('#summary-next').textContent = a.nextLevel && !isOwner() ? `До ${a.nextLevel}: ${money(Math.max(0, a.nextLevelDepositCents - a.depositCents))}` : '';
  $('#status-tier').textContent = a.tier || 'Нет уровня';
  $('#status-rank').textContent = isOwner() ? 'Владелец' : `Уровень ${rank || 1}`;
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
  const tint = level?.color || '#6B7280';
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
  return new Intl…6570 tokens truncated…').close());
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#login-form button[type=submit]'); button.disabled = true;
    $('#login-message').classList.add('hidden');
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({
        accountId: $('#login-id').value.trim(), password: $('#login-password').value,
        remember: false,
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
    } catch (error) { message($('#setup-message'), error.message); }
    finally { button.disabled = false; }
  });
  $('#go-to-verification').addEventListener('click', () => show('access'));
  $('#back-to-registration').addEventListener('click', () => show('register'));
  $('#continue-activation').addEventListener('click', () => show('deposit'));
  $('#owner-stats-link').addEventListener('click', () => window.location.assign(sectionUrl('owner')));
  $('#menu-terminal').addEventListener('click', () => window.location.assign(sectionUrl('app')));
  for (const id of ['status-account', 'menu-account']) $(`#${id}`).addEventListener('click', () => window.location.assign(sectionUrl('account')));
  $('#account-back').addEventListener('click', () => window.location.assign(sectionUrl('app')));
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
  $('#close-upgrade').addEventListener('click', () => $('#upgrade-dialog').close());
  $('#upgrade-dialog').addEventListener('click', event => { if (event.target.id === 'upgrade-dialog') event.target.close(); });
  setInterval(updateCycleTime, 30_000);
  $('#back-terminal').addEventListener('click', () => window.location.assign(sectionUrl('app')));
  $('#logout-button').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } finally { clearAuth(); }
  });
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
  $('#owner-user-content').addEventListener('submit', async event => {
    if (event.target.id !== 'owner-password-reset') return;
    event.preventDefault(); const button = event.target.querySelector('button[type=submit]'); button.disabled = true;
    try {
      await api(`/api/admin/users/${state.ownerUserId}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword: $('#owner-temporary-password').value }) });
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
        login.addEventListener('click', () => show('login'), { once: true }); $('#id-message').append(login);
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
if (section && !state.token) $('#login').classList.remove('hidden');
init();

