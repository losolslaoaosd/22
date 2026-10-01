import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function harness(pathname = '/') {
  const nodes = new Map();
  const listeners = {};
  const entries = [pathname];
  let index = 0;
  const element = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      classList: { add() {}, remove() {}, toggle() {} },
      dataset: {}, style: { setProperty() {} },
      setAttribute() {}, removeAttribute() {}, addEventListener() {},
      textContent: '',
      children: [],
      append(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
    });
    return nodes.get(selector);
  };
  const location = { pathname, origin: 'https://bluefinplus.site' };
  const window = {
    location,
    BLUFIN_API_BASE: 'https://bluefinplus.site',
    BluFinI18n: { language: 'ru', t: key => key },
    addEventListener(name, listener) { listeners[name] = listener; },
    dispatchEvent() {},
    scrollTo() {},
    history: {
      pushState(_state, _title, path) { entries.splice(++index); entries.push(path); location.pathname = path; },
      replaceState(_state, _title, path) { entries[index] = path; location.pathname = path; },
    },
  };
  const document = { body: { dataset: {} }, querySelector: element, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ classList: { add() {} } }) };
  const context = vm.createContext({ window, document, localStorage: { getItem: () => null, removeItem() {} },
    sessionStorage: { getItem: () => null, removeItem() {} }, URL, setInterval: () => 1,
    clearInterval() {}, clearTimeout() {}, CustomEvent });
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(source, context);
  vm.runInContext('updateTerminalAccount = () => {}; updateAccountPage = () => {}; renderLevelTrack = () => {}; loadHistory = () => {}; renderHistory = () => {}; openHistoryDetail = () => {};', context);
  return { context, location, element, back() { if (index > 0) { location.pathname = entries[--index]; listeners.popstate(); } },
    forward() { if (index < entries.length - 1) { location.pathname = entries[++index]; listeners.popstate(); } } };
}

test('guest routes update the URL and browser Back/Forward restores the screen', () => {
  const app = harness();
  vm.runInContext("state.status = 'guest'; show('landing'); navigate('login');", app.context);
  assert.equal(app.location.pathname, '/login/');
  app.back(); assert.equal(app.location.pathname, '/');
  app.forward(); assert.equal(app.location.pathname, '/login/');
});

test('protected routes do not reappear after logout and Back', () => {
  const app = harness('/app/');
  vm.runInContext("state.status = 'active'; state.account = { status: 'active', tier: 'BASE' }; navigate('settings'); clearAuth();", app.context);
  assert.equal(app.location.pathname, '/');
  app.back();
  assert.equal(app.location.pathname, '/login/');
  assert.equal(vm.runInContext('state.status', app.context), 'guest');
});

test('active account can move between analysis, history and profile with browser history', () => {
  const app = harness('/app/');
  vm.runInContext("state.status = 'active'; state.account = { status: 'active', tier: 'BASE' }; show('dashboard'); navigate('history'); navigate('account');", app.context);
  assert.equal(app.location.pathname, '/account/');
  app.back(); assert.equal(app.location.pathname, '/history/');
  app.back(); assert.equal(app.location.pathname, '/app/');
  app.forward(); assert.equal(app.location.pathname, '/history/');
});

test('all AI modes can start the localized processing UI', () => {
  const app = harness('/app/');
  for (const [mode, power, steps] of [['Fast', 30, 4], ['Deep', 70, 6], ['Maximum', 100, 7]]) {
    vm.runInContext(`beginProcessing('${mode}');`, app.context);
    assert.equal(app.element('#processing-power').textContent, `${power}%`);
    assert.equal(app.element('#processing-steps').children.length, steps);
    assert.equal(app.element('#dashboard').dataset.analysisState, 'processing');
  }
});
