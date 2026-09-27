// Public API address. Keep API keys and secrets out of this file.
window.BLUFIN_STATIC_PREVIEW = false;
window.BLUFIN_API_BASE = ['bluefinplus.site', 'www.bluefinplus.site'].includes(window.location.hostname)
  ? window.location.origin
  : 'https://bluefinplus.site';
