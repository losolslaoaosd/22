const $ = selector => document.querySelector(selector);
const state = { status: 'guest', role: null, accountId: null, file: null, expiry: 3, config: null, polling: null, resultTimer: null, token: sessionStorage.getItem('blufin_session') };
const views = ['landing', 'access', 'deposit', 'dashboard'];
const apiBase = (window.BLUFIN_API_BASE || '').replace(/\/$/, '');
const staticPreview = window.BLUFIN_STATIC_PREVIEW === true && !apiBase;

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
  $('#owner-panel').classList.toggle('hidden', state.role !== 'admin');
  $('#account-chip').classList.toggle('hidden', !state.accountId && state.role !== 'admin');
  $('#account-chip').textContent = state.role === 'admin' ? 'ВЛАДЕЛЕЦ' : state.accountId ? `ID ${state.accountId}` : '';
  $('#logout-button').classList.toggle('hidden', !state.token);
  if (view === 'dashboard' && state.role === 'admin') refreshOwnerStats();
}
function routeFromStatus() { show(state.status === 'active' ? 'dashboard' : state.status === 'deposit' ? 'deposit' : 'landing'); }
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
  sessionStorage.setItem('blufin_session', result.token);
  $('#account-id').value = '';
  routeFromStatus();
}
async function refreshSession(navigate = true) {
  if (!state.token && apiBase) {
    state.status = 'guest'; state.accountId = null; state.role = null;
    if (navigate) routeFromStatus();
    return { status: 'guest' };
  }
  try {
    const account = await api('/api/me');
    if (account.status === 'guest') { state.token = null; sessionStorage.removeItem('blufin_session'); }
    const changed = account.status !== state.status;
    state.status = account.status;
    state.accountId = account.accountId || null;
    state.role = account.role || null;
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
  $('#result-section').classList.add('hidden');
  $('#workflow-aside').classList.remove('hidden');
}
async function imageDataUrl(file) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { image.close(); }
}
function renderResult(data) {
  const r = data.result;
  const labels = { UP: 'ВВЕРХ', DOWN: 'ВНИЗ' };
  if (!labels[r.verdict]) {
    $('#result-section').classList.add('hidden');
    $('#workflow-aside').classList.remove('hidden');
    message($('#analysis-error'), 'По этому скриншоту направление определить не удалось. Загрузите более чёткий график и повторите анализ.');
    return;
  }
  const box = $('#verdict-card');
  box.classList.toggle('down', r.verdict === 'DOWN');
  box.classList.remove('signal-ready');
  void box.offsetWidth;
  box.classList.add('signal-ready');
  $('#verdict-text').textContent = labels[r.verdict];
  $('#verdict-reason').textContent = r.reason;
  $('#result-title').textContent = `${data.asset} · ${data.expiry} мин`;
  $('#result-stamp').textContent = `АНАЛИЗ: ${moscow(new Date(data.created_at), true)} МСК`;
  for (const [field, value] of Object.entries({ trend: r.trend, timeframe: r.visible_timeframe, levels: r.key_levels, setup: r.setup, invalidation: r.invalidation, limitations: r.limitations })) {
    $(`#report-${field}`).textContent = value || 'Нет данных на скриншоте';
  }
  $('#workflow-aside').classList.add('hidden');
  $('#result-section').classList.remove('hidden');
  if (state.resultTimer) clearInterval(state.resultTimer);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((data.expires_at - Date.now()) / 1000));
    $('#freshness').textContent = seconds ? `Скриншот актуален для этого разбора ещё ${seconds} сек · до ${moscow(new Date(data.expires_at), true)} МСК` : 'Время разбора истекло. Перед новой сделкой обновите график и повторите анализ.';
    if (!seconds && state.resultTimer) { clearInterval(state.resultTimer); state.resultTimer = null; }
  };
  update(); state.resultTimer = setInterval(update, 1000);
  if (window.matchMedia('(max-width: 760px)').matches) $('#result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const select = $('#asset');
    for (const asset of state.config.assets) {
      const option = document.createElement('option'); option.value = asset; option.textContent = asset; select.append(option);
    }
    await refreshSession(false);
    routeFromStatus();
  } catch {
    disableRegistration();
    message($('#id-message'), staticPreview ? 'Пока доступен предпросмотр сайта. Проверка ID, депозита и анализ заработают после подключения Cloudflare Workers.' : 'Сервер проверки сейчас недоступен. Регистрация и проверка ID временно отключены.', false);
    show('landing');
  }
  $('#begin-button').addEventListener('click', () => show('access'));
  $('#logout-button').addEventListener('click', () => {
    state.token = null; state.status = 'guest'; state.role = null; state.accountId = null;
    sessionStorage.removeItem('blufin_session');
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
      state.status = result.status; state.accountId = result.accountId; routeFromStatus();
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
  $('#chart-file').addEventListener('change', e => setFile(e.target.files[0]));
  $('#dropzone').addEventListener('click', e => { if (e.target.id !== 'remove-file') $('#chart-file').click(); });
  $('#dropzone').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#chart-file').click(); } });
  $('#dropzone').addEventListener('dragover', e => { e.preventDefault(); $('#dropzone').classList.add('dragging'); });
  $('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragging'));
  $('#dropzone').addEventListener('drop', e => { e.preventDefault(); $('#dropzone').classList.remove('dragging'); setFile(e.dataTransfer.files[0]); });
  $('#remove-file').addEventListener('click', e => {
    e.stopPropagation(); state.file = null; $('#chart-file').value = '';
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    $('#image-preview').classList.add('hidden'); $('#empty-upload').classList.remove('hidden');
    $('#result-section').classList.add('hidden'); $('#workflow-aside').classList.remove('hidden');
  });
  $('#expiry-options').addEventListener('click', e => {
    const button = e.target.closest('[data-expiry]'); if (!button) return;
    state.expiry = Number(button.dataset.expiry);
    for (const item of $('#expiry-options').children) item.classList.toggle('selected', item === button);
  });
  $('#analysis-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.file) return message($('#analysis-error'), 'Сначала загрузите скриншот графика.');
    const button = $('#analyze-button'); button.disabled = true; button.textContent = 'Анализируем график…';
    $('#dropzone').classList.add('is-analyzing');
    const animationStart = performance.now();
    $('#analysis-error').classList.add('hidden');
    $('#result-section').classList.add('hidden');
    $('#workflow-aside').classList.remove('hidden');
    try {
      const image = await imageDataUrl(state.file);
      const result = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ image, asset: $('#asset').value, expiry: state.expiry }) });
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1600 - (performance.now() - animationStart))));
      renderResult(result);
    } catch (error) { message($('#analysis-error'), error.message); $('#analysis-error').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    finally { $('#dropzone').classList.remove('is-analyzing'); button.disabled = false; button.innerHTML = 'Проанализировать график <span aria-hidden="true">↗</span>'; }
  });
}
init();
