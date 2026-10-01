import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function load({ browser = 'en-US', saved = null } = {}) {
  const messages = { ru: { greeting: 'Привет', label: 'Язык', amount: 'Цена {0}' }, en: { greeting: 'Hello', label: 'Language', amount: 'Price {0}' } };
  const text = { textContent: '{{greeting}}', isConnected: true };
  const title = { attributes: [{ name: 'aria-label', value: '{{label}}' }], values: {}, isConnected: true, setAttribute(name, value) { this.values[name] = value; } };
  const buttons = ['ru', 'en'].map(language => ({ dataset: { language }, values: {}, setAttribute(name, value) { this.values[name] = value; } }));
  const storage = new Map(saved ? [['blufin_language', saved]] : []);
  let click;
  const document = {
    documentElement: { lang: '' },
    createTreeWalker() { return { nextNode() { if (this.seen) return false; this.seen = true; this.currentNode = text; return true; } }; },
    querySelectorAll(selector) { return selector === '*' ? [title] : buttons; },
    querySelector() { return { addEventListener(_name, handler) { click = handler; } }; },
    dispatchEvent() {},
  };
  const window = { BLUFIN_MESSAGES: messages };
  const context = vm.createContext({ window, document, navigator: { languages: [browser] }, NodeFilter: { SHOW_TEXT: 4 }, CustomEvent: class {}, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
  vm.runInContext(readFileSync(new URL('../i18n.js', import.meta.url), 'utf8'), context);
  return { window, document, text, title, buttons, storage, click };
}

test('browser locale selects Russian and translates text and attributes', () => {
  const page = load({ browser: 'uk-UA' });
  assert.equal(page.document.documentElement.lang, 'ru');
  assert.equal(page.text.textContent, 'Привет');
  assert.equal(page.title.values['aria-label'], 'Язык');
  assert.equal(page.window.BluFinI18n.t('amount', 10), 'Цена 10');
});

test('saved choice wins and changing language persists without navigating', () => {
  const page = load({ browser: 'ru-RU', saved: 'en' });
  assert.equal(page.text.textContent, 'Hello');
  page.click({ target: { closest: () => page.buttons[0] } });
  assert.equal(page.text.textContent, 'Привет');
  assert.equal(page.storage.get('blufin_language'), 'ru');
  assert.equal(page.buttons[0].values['aria-pressed'], 'true');
});

test('account language is used only until a manual choice is saved', () => {
  const page = load({ browser: 'en-US' });
  page.window.BluFinI18n.useAccount('ru');
  assert.equal(page.text.textContent, 'Привет');
  page.window.BluFinI18n.set('ru');
  page.window.BluFinI18n.useAccount('en');
  assert.equal(page.text.textContent, 'Привет');
  assert.equal(page.storage.get('blufin_language'), 'ru');
});
