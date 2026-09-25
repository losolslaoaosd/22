const $ = selector => document.querySelector(selector);
const state = { status: 'guest', role: null, accountId: null, account: null, file: null, mode: 'Fast', config: null, polling: null, resultTimer: null, latestResult: null, clockOffset: 0, token: sessionStorage.getItem('blufin_session') };
const views = ['landing', 'access', 'deposit', 'dashboard', 'owner-stats-view'];
const apiBase = (window.BLUFIN_API_BASE || '').replace(/\/$/, '');
const staticPreview = window.BLUFIN_STATIC_PREVIEW === true && !apiBase;

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
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (state.polling) { clearInterval(state.polling); state.polling = null; }
  if (view === 'deposit') state.polling = setInterval(() => refreshSession(false), 10_000);
  $('#owner-stats-link').classList.toggle('hidden', state.role !== 'admin' || view !== 'dashboard');
  $('#upgrade-link').classList.toggle('hidden', view !== 'dashboard');
  $('#account-chip').classList.toggle('hidden', !state.accountId && state.role !== 'admin');
  $('#account-chip').textContent = state.role === 'admin' ? 'ВЛАДЕЛЕЦ' : state.accountId ? `ID ${state.accountId}` : '';
  $('#logout-button').classList.toggle('hidden', !state.token);
  if (view === 'owner-stats-view' && state.role === 'admin') refreshOwnerStats();
  if (view === 'dashboard') { updateTerminalAccount(); restoreLatest(); }
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
async function enterOwnerCode(code) {
  const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ code }) });
  state.token = result.token; state.status = 'active'; state.role = 'admin'; state.accountId = null;
  state.account = { status: 'active', role: 'admin', tier: 'ULTRA', modes: ['Fast', 'Deep', 'Maximum'] }; state.latestResult = null;
  sessionStorage.setItem('blufin_session', result.token);
  $('#account-id').value = '';
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
    if (account.status === 'active' && section === 'app') updateTerminalAccount();
    if (navigate && changed) routeFromStatus();
    if (!navigate && changed && account.status === 'active') routeFromStatus();
    if (!navigate && account.status === 'deposit') $('#deposit-message').textContent = 'Ожидаем подтверждение депозита. Иногда оно приходит не сразу.';
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
  const steps = ['График получен', 'Определение пары, цены и таймфрейма', 'Анализ тренда', 'Формирование сигнала'];
  if (mode !== 'Fast') steps.splice(3, 0, 'Анализ структуры', 'Анализ волатильности');
  if (mode === 'Maximum') steps.splice(5, 0, 'Historical Pattern Search', 'AI Consensus');
  $('#processing-mode').textContent = `${mode.toUpperCase()} AI`;
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
  const r = data.result;
  const actionable = ['UP', 'DOWN'].includes(r.verdict) && Boolean(data.signalExpiresAt);
  const panel = $('#terminal-result');
  panel.classList.toggle('no-trade', !actionable);
  panel.classList.remove('expired');
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
      if (!seconds && state.resultTimer) { clearInterval(state.resultTimer); state.resultTimer = null; }
    };
    update();
    if (data.signalExpiresAt > Date.now() - state.clockOffset) state.resultTimer = setInterval(update, 1000);
  }
  if (scroll) $('#signal-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function restoreLatest() {
  if (state.latestResult) return renderResult(state.latestResult);
  try {
    const history = await api('/api/history');
    if (!$('#dashboard').classList.contains('hidden') && history.analyses?.[0] && $('#terminal-processing').classList.contains('hidden'))
      renderResult({ ...history.analyses[0], serverTime: history.serverTime });
  } catch { /* A missing history must not block a new analysis. */ }
}
async function init() {
  if (staticPreview) {
    $('#preview-banner').classList.remove('hidden');
    disableRegistration();
    message($('#id-message'), 'Пока доступен предпросмотр сайта. Проверка ID, депозита и анализ заработают после подключения Cloudflare Workers.', false);
  }
  try {
    state.config = await api('/api/config');
    if (!state.config.attributionConfigured) {
      message($('#id-message'), 'Проверка аккаунтов ещё настраивается. Регистрация через BLUFIN+ откроется после подключения postback.');
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
    message($('#id-message'), staticPreview ? 'Пока доступен предпросмотр сайта. Проверка ID, депозита и анализ заработают после подключения Cloudflare Workers.' : 'Сервер проверки сейчас недоступен. Регистрация и проверка ID временно отключены.', false);
    show('landing');
  }
  $('#begin-button').addEventListener('click', () => show('access'));
  $('#owner-stats-link').addEventListener('click', () => window.location.assign(sectionUrl('owner')));
  $('#upgrade-link').addEventListener('click', openUpgrade);
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
  $('#id-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#id-form button'); button.disabled = true; button.textContent = 'Проверяем…';
    $('#id-message').classList.add('hidden');
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
      state.status = result.status; state.accountId = result.accountId; state.role = null; state.account = result; state.latestResult = null; routeFromStatus();
    } catch (error) { message($('#id-message'), error.message + (error.code === 'ID_NOT_FOUND' ? ' Ссылка для регистрации находится ниже.' : '')); }
    finally { button.disabled = false; button.innerHTML = 'Продолжить <span aria-hidden="true">→</span>'; }
  });
  $('#check-deposit').addEventListener('click', async () => {
    const button = $('#check-deposit'); button.disabled = true;
    $('#deposit-message').textContent = 'Проверяем статус…';
    const account = await refreshSession(false);
    if (account?.status === 'deposit') $('#deposit-message').textContent = 'Депозит пока не подтверждён. Попробуйте через несколько минут.';
    button.disabled = false;
  });
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
    const card = e.target.closest('[data-mode]'); if (!card) return;
    if (card.getAttribute('aria-disabled') === 'true') {
      return message($('#analysis-error'), card.querySelector('.mode-lock').textContent);
    }
    state.mode = card.dataset.mode; updateModes(); $('#analysis-error').classList.add('hidden');
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
