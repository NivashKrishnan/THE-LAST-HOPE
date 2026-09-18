const KEY = 'tlh_save_v1';
const SETTINGS_KEY = 'tlh_settings_v1';

export class SaveSys {
  constructor() { this.data = null; }
  has() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
  load() {
    try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch { this.data = null; }
    return this.data;
  }
  write(d) { this.data = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
  patch(p) { this.write(Object.assign({}, this.data || {}, p)); }
  clear() { this.data = null; try { localStorage.removeItem(KEY); } catch {} }

  hasFlag(f) { return !!(this.data && this.data.flags && this.data.flags.includes(f)); }
  addFlag(f) {
    const d = this.data || { level: 1, flags: [] };
    d.flags = d.flags || [];
    if (!d.flags.includes(f)) d.flags.push(f);
    this.write(d);
  }
  clearLevelFlags(n) {
    if (!this.data || !this.data.flags) return;
    this.data.flags = this.data.flags.filter(f => !f.startsWith('L' + n + ':'));
    this.write(this.data);
  }
  countLevelFlags(n) {
    if (!this.data || !this.data.flags) return 0;
    return this.data.flags.filter(f => f.startsWith('L' + n + ':')).length;
  }
}

export function loadSettings() {
  try { return Object.assign({ volume: 0.8, sens: 1.0, invert: false, quality: 'high' }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch { return { volume: 0.8, sens: 1.0, invert: false, quality: 'high' }; }
}
export function storeSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }
