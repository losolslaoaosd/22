// UI translations. The saved explicit choice always wins over account and browser hints.
(() => {
  const messages = window.BLUFIN_MESSAGES;
  const saved = (() => { try { return localStorage.getItem('blufin_language'); } catch { return null; } })();
  const russianLocales = new Set(['ru', 'uk', 'be', 'kk', 'ky']);
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const detected = russianLocales.has(browserLanguages[0]?.split('-')[0]?.toLowerCase()) ? 'ru' : 'en';
  let language = ['ru', 'en'].includes(saved) ? saved : detected;
  const markedText = new Map();
  const markedAttributes = [];
  const marker = /\{\{([^}]+)\}\}/g;
  const translate = (key, ...values) => {
    const template = messages[language]?.[key] ?? messages.ru[key] ?? key;
    return template.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''));
  };
  const render = () => {
    document.documentElement.lang = language;
    for (const [node, template] of markedText) {
      if (node.isConnected) node.textContent = template.replace(marker, (_, key) => translate(key));
    }
    for (const { element, attribute, template } of markedAttributes) {
      if (element.isConnected) element.setAttribute(attribute, template.replace(marker, (_, key) => translate(key)));
    }
    document.querySelectorAll('[data-language]').forEach(button => {
      const selected = button.dataset.language === language;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-current', selected ? 'true' : 'false');
    });
    document.dispatchEvent(new CustomEvent('blufin:languagechange', { detail: language }));
  };
  window.BluFinI18n = {
    t: translate,
    get language() { return language; },
    get explicit() { return ['ru', 'en'].includes(saved) || this.manuallyChosen; },
    useAccount(accountLanguage) {
      if (!this.explicit && ['ru', 'en'].includes(accountLanguage) && language !== accountLanguage) {
        language = accountLanguage; render();
      }
    },
    set(next) {
      if (!['ru', 'en'].includes(next)) return;
      language = next;
      this.manuallyChosen = true;
      try { localStorage.setItem('blufin_language', next); } catch { /* Private browsing may deny storage. */ }
      render();
    },
  };
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent.includes('{{')) markedText.set(node, node.textContent);
  }
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      if (attribute.value.includes('{{')) markedAttributes.push({ element, attribute: attribute.name, template: attribute.value });
    }
  }
  document.querySelector('.language-switch')?.addEventListener('click', event => {
    const button = event.target.closest('[data-language]');
    if (button) window.BluFinI18n.set(button.dataset.language);
  });
  render();
})();
