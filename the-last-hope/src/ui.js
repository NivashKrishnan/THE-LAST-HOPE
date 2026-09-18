import { runeDataURL, sleep } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      fade: $('fade'), hud: $('hud'), menu: $('menu'), menuBg: $('menuBgCanvas'),
      btnStart: $('btnStart'), btnContinue: $('btnContinue'), btnSettings: $('btnSettings'), btnExit: $('btnExit'),
      settings: $('settings'), setTitle: $('setTitle'), setVolume: $('setVolume'), setSens: $('setSens'),
      setInvert: $('setInvert'), setQuality: $('setQuality'), btnSetBack: $('btnSetBack'),
      objectivePanel: $('objectivePanel'), objText: $('objText'), clueBar: $('clueBar'),
      petaloWrap: $('petaloWrap'), petaloDot: $('petaloDot'),
      hintBar: $('hintBar'), prompt: $('prompt'), promptText: $('promptText'),
      dialogue: $('dialogue'), dlgName: $('dlgName'), dlgText: $('dlgText'),
      notify: $('notify'), notifyTitle: $('notifyTitle'), notifySub: $('notifySub'),
      feedback: $('feedback'), seqDots: $('seqDots'),
      chapter: $('chapter'), chapterNum: $('chapterNum'), chapterTitle: $('chapterTitle'),
      lbTop: $('lbTop'), lbBot: $('lbBot'),
      pause: $('pause'), btnResume: $('btnResume'), btnRestartL: $('btnRestartL'),
      btnPauseSettings: $('btnPauseSettings'), btnQuit: $('btnQuit'),
      puzzle: $('puzzle'), puzPanel: $('puzPanel'), puzTitle: $('puzTitle'), puzHint: $('puzHint'),
      puzSlots: $('puzSlots'), puzSymbols: $('puzSymbols'), puzMsg: $('puzMsg'),
      btnPuzClear: $('btnPuzClear'), btnPuzConfirm: $('btnPuzConfirm'), btnPuzClose: $('btnPuzClose'),
      story: $('story'), storyText: $('storyText'),
      ending: $('ending'), endingText: $('endingText'), btnEndContinue: $('btnEndContinue'), btnEndRestart: $('btnEndRestart'),
      exitScreen: $('exitScreen'), btnExitBack: $('btnExitBack'),
      focusOverlay: $('focusOverlay'),
      playerHpWrap: $('playerHpWrap'), playerHpFill: $('playerHpFill'), playerHpVal: $('playerHpVal'),
      monsterHpWrap: $('monsterHpWrap'), monsterName: $('monsterName'), monsterHpFill: $('monsterHpFill'),
      weaponHud: $('weaponHud'), pip1: $('pip1'), pip2: $('pip2'), pip3: $('pip3'),
      deathScreen: $('deathScreen'), btnRespawn: $('btnRespawn'),
      introCinematic: $('introCinematic'), introText: $('introText'),
      introTitleCard: $('introTitleCard'), introSignalWave: $('introSignalWave'), introSpeaker: $('introSpeaker'),
    };
    this.dlgQueue = [];
    this.dlgBusy = false;
    this.notifyTimer = null;
    this.settingsReturn = 'menu';
    this._wire();
    this._menuAnim();
  }

  _wire() {
    const g = this.game;
    const act = (a) => () => g.handleUI(a);
    if (this.el.btnStart) this.el.btnStart.onclick = act('start');
    if (this.el.btnContinue) this.el.btnContinue.onclick = act('continue');
    if (this.el.btnSettings) this.el.btnSettings.onclick = () => this.openSettings('menu');
    if (this.el.btnExit) this.el.btnExit.onclick = act('exit');
    if (this.el.btnExitBack) this.el.btnExitBack.onclick = act('exitBack');
    if (this.el.btnResume) this.el.btnResume.onclick = act('resume');
    if (this.el.btnRestartL) this.el.btnRestartL.onclick = act('restartLevel');
    if (this.el.btnPauseSettings) this.el.btnPauseSettings.onclick = () => this.openSettings('pause');
    if (this.el.btnQuit) this.el.btnQuit.onclick = act('quitMenu');
    if (this.el.btnSetBack) this.el.btnSetBack.onclick = () => this.closeSettings();
    if (this.el.btnEndContinue) this.el.btnEndContinue.onclick = act('endContinue');
    if (this.el.btnEndRestart) this.el.btnEndRestart.onclick = act('endRestart');
    if (this.el.btnRespawn) {
      this.el.btnRespawn.onclick = () => {
        g.playerCombat?.respawn();
      };
    }
    document.querySelectorAll('.btn').forEach(b => {
      b.addEventListener('mouseenter', () => g.audio.uiHover());
      b.addEventListener('click', () => g.audio.uiClick());
    });
    const push = () => {
      g.applySettingsFromUI({
        volume: this.el.setVolume.value / 100,
        sens: this.el.setSens.value / 100,
        invert: this.el.setInvert.checked,
        quality: this.el.setQuality.value,
      });
    };
    ['setVolume', 'setSens', 'setInvert', 'setQuality'].forEach(k => this.el[k].addEventListener('input', push));
  }

  syncSettings(s) {
    this.el.setVolume.value = Math.round(s.volume * 100);
    this.el.setSens.value = Math.round(s.sens * 100);
    this.el.setInvert.checked = !!s.invert;
    this.el.setQuality.value = s.quality;
  }

  openSettings(from) {
    this.settingsReturn = from;
    this.syncSettings(this.game.settings);
    this.el.settings.classList.remove('hidden');
  }
  closeSettings() {
    this.el.settings.classList.add('hidden');
    if (this.settingsReturn === 'menu') this.el.menu.classList.remove('hidden');
  }

  // ---------- fade ----------
  async fade(color, opacity, ms = 700) {
    const f = this.el.fade;
    f.style.background = color;
    f.style.transition = `opacity ${ms}ms ease`;
    // force reflow so transition applies
    void f.offsetWidth;
    f.style.opacity = opacity;
    await sleep(ms + 30);
  }

  // ---------- menu ----------
  showMenu(hasSave) {
    this.el.menu.classList.remove('hidden');
    this.el.btnContinue.classList.toggle('hidden', !hasSave);
    this.menuAnimOn = true;
  }
  hideMenu() { this.el.menu.classList.add('hidden'); this.menuAnimOn = false; }

  _menuAnim() {
    this.menuAnimOn = true;
    const cv = this.el.menuBg, g = cv.getContext('2d');
    let stars = [];
    const resize = () => {
      cv.width = innerWidth; cv.height = innerHeight;
      stars = [];
      for (let i = 0; i < 160; i++) stars.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: Math.random() * 1.6 + 0.3, v: Math.random() * 6 + 2, tw: Math.random() * 7 });
    };
    resize();
    addEventListener('resize', resize);
    let shoot = null, last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!this.menuAnimOn || this.el.menu.classList.contains('hidden')) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        s.y -= s.v * dt; s.tw += dt * 3;
        if (s.y < -4) { s.y = cv.height + 4; s.x = Math.random() * cv.width; }
        const a = 0.35 + 0.35 * Math.sin(s.tw);
        g.fillStyle = `rgba(180,220,255,${a})`;
        g.fillRect(s.x, s.y, s.s, s.s);
      }
      if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * cv.width * 0.8, y: Math.random() * cv.height * 0.4, t: 0 };
      if (shoot) {
        shoot.t += dt * 2.2;
        const t = shoot.t, x = shoot.x + t * 320, y = shoot.y + t * 130;
        g.strokeStyle = `rgba(200,230,255,${Math.max(0, 1 - t)})`;
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 60 * (1 - t * 0.4), y - 24 * (1 - t * 0.4)); g.stroke();
        if (t >= 1.2) shoot = null;
      }
    };
    requestAnimationFrame(loop);
  }

  // ---------- HUD ----------
  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }

  objective(text) {
    this.el.objText.textContent = text;
    this.el.objectivePanel.classList.remove('flash');
    void this.el.objectivePanel.offsetWidth;
    this.el.objectivePanel.classList.add('flash');
  }

  notify(title, sub, tone = 'cy', ms = 3000) {
    const n = this.el.notify;
    n.classList.remove('hidden');
    this.el.notifyTitle.textContent = title;
    this.el.notifyTitle.className = tone === 'gold' ? 'gold' : tone === 'red' ? 'red' : '';
    this.el.notifySub.textContent = sub;
    n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
    clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => n.classList.add('hidden'), ms);
  }

  addClueIcon(runeId, label) {
    const d = document.createElement('div');
    d.className = 'clueIcon'; d.title = label;
    const img = document.createElement('img');
    img.src = runeDataURL(runeId, '#ffc46b', 96);
    d.appendChild(img);
    this.el.clueBar.appendChild(d);
  }
  resetClues() { this.el.clueBar.innerHTML = ''; }

  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.promptText.textContent = text;
    this.el.prompt.classList.remove('hidden');
  }

  hintBar(html) {
    if (!html) { this.el.hintBar.classList.add('hidden'); return; }
    this.el.hintBar.innerHTML = html;
    this.el.hintBar.classList.remove('hidden');
  }

  petaloIndicator(v) { this.el.petaloWrap.classList.toggle('hidden', !v); }
  petaloPing() {
    this.el.petaloDot.classList.remove('ping');
    void this.el.petaloDot.offsetWidth;
    this.el.petaloDot.classList.add('ping');
  }

  // ---------- dialogue ----------
  dialogue(name, text, ms = 3400) {
    this.dlgQueue.push({ name, text, ms });
    if (!this.dlgBusy) this._nextDlg();
  }
  async _nextDlg() {
    if (!this.dlgQueue.length) { this.dlgBusy = false; this.el.dialogue.classList.add('hidden'); return; }
    this.dlgBusy = true;
    const d = this.dlgQueue.shift();
    this.el.dlgName.textContent = d.name;
    this.el.dlgText.textContent = d.text;
    this.el.dialogue.classList.remove('hidden');
    if (d.name === 'PETALO') { this.petaloPing(); this.game.audio.petaloBlip(); }
    await sleep(d.ms);
    this._nextDlg();
  }
  clearDialogue() { this.dlgQueue.length = 0; }

  feedback(text, ok = true) {
    const f = this.el.feedback;
    f.classList.remove('hidden');
    f.textContent = text;
    f.style.color = ok ? '#ffc46b' : '#ff6b6b';
    f.style.animation = 'none'; void f.offsetWidth; f.style.animation = '';
    clearTimeout(this.fbTimer);
    this.fbTimer = setTimeout(() => f.classList.add('hidden'), 950);
  }

  seqDots(n, filled) {
    const d = this.el.seqDots;
    if (n === null) { d.classList.add('hidden'); return; }
    if (d.children.length !== n) {
      d.innerHTML = '';
      for (let i = 0; i < n; i++) { const s = document.createElement('div'); s.className = 'seqDot'; d.appendChild(s); }
    }
    d.classList.remove('hidden');
    [...d.children].forEach((c, i) => c.classList.toggle('on', i < filled));
  }

  async chapter(num, title, ms = 2600) {
    this.el.chapterNum.textContent = 'CHAPTER ' + num;
    this.el.chapterTitle.textContent = title;
    this.el.chapter.classList.remove('hidden');
    await sleep(ms);
    this.el.chapter.classList.add('hidden');
  }

  letterbox(on) {
    this.el.lbTop.classList.toggle('on', on);
    this.el.lbBot.classList.toggle('on', on);
  }

  // ---------- pause / ending / story ----------
  showPause(v) { this.el.pause.classList.toggle('hidden', !v); }

  showEnding(text) {
    this.el.endingText.innerHTML = text;
    this.el.ending.classList.remove('hidden');
  }
  hideEnding() { this.el.ending.classList.add('hidden'); }

  showExit(v) { this.el.exitScreen.classList.toggle('hidden', !v); }

  focusOverlay(v) { this.el.focusOverlay.classList.toggle('hidden', !v); }

  // ---------- combat HUD ----------
  updatePlayerHp(cur, max) {
    if (!this.el.playerHpWrap) return;
    this.el.playerHpWrap.classList.remove('hidden');
    const pct = Math.max(0, Math.min(100, (cur / max) * 100));
    this.el.playerHpFill.style.width = `${pct}%`;
    this.el.playerHpVal.textContent = Math.max(0, Math.round(cur));
  }

  damageFlash() {
    const v = document.getElementById('vignette');
    if (!v) return;
    v.style.background = 'radial-gradient(ellipse at center, rgba(255,0,0,0.3) 0%, rgba(255,0,0,0.65) 100%)';
    setTimeout(() => {
      v.style.background = 'radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.42) 100%)';
    }, 240);
  }

  updateMonsterHp(cur, max, name) {
    if (!this.el.monsterHpWrap) return;
    this.el.monsterHpWrap.classList.remove('hidden');
    if (name) this.el.monsterName.textContent = name;
    const pct = Math.max(0, Math.min(100, (cur / max) * 100));
    this.el.monsterHpFill.style.width = `${pct}%`;
  }

  hideMonsterHp() {
    if (this.el.monsterHpWrap) this.el.monsterHpWrap.classList.add('hidden');
  }

  updateWeaponHud(equipped, comboStep) {
    if (!this.el.weaponHud) return;
    this.el.weaponHud.classList.toggle('hidden', !equipped);
    if (this.el.pip1) this.el.pip1.classList.toggle('active', comboStep >= 1);
    if (this.el.pip2) this.el.pip2.classList.toggle('active', comboStep >= 2);
    if (this.el.pip3) this.el.pip3.classList.toggle('active', comboStep >= 3);
  }

  showDeathScreen(v) {
    if (this.el.deathScreen) this.el.deathScreen.classList.toggle('hidden', !v);
  }

  story(lines) {
    return new Promise((resolve) => {
      const st = this.el.storyText;
      st.innerHTML = '';
      lines.forEach(l => {
        const p = document.createElement('p');
        if (l.startsWith('"')) p.className = 'sig';
        p.textContent = l;
        st.appendChild(p);
      });
      this.el.story.classList.remove('hidden');
      const ps = [...st.children];
      ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 600 + i * 1900));
      const minWait = 600 + ps.length * 1900;
      let done = false, revealed = false, lastClick = 0;
      const finish = () => {
        if (done) return; done = true;
        this.el.story.classList.add('hidden');
        this.el.story.removeEventListener('click', onClick);
        resolve();
      };
      const onClick = () => {
        const now = performance.now();
        if (!revealed) { revealed = true; lastClick = now; ps.forEach(p => p.classList.add('on')); }
        else if (now - lastClick > 400) finish();
      };
      this.el.story.addEventListener('click', onClick);
      setTimeout(finish, minWait + 8000);
    });
  }

  playRadioIntro() {
    return new Promise((resolve) => {
      const cin = this.el.introCinematic;
      if (!cin) { resolve(); return; }

      const txt = this.el.introText;
      const card = this.el.introTitleCard;
      const wave = this.el.introSignalWave;
      const spk = this.el.introSpeaker;

      card.classList.add('hidden');
      wave.classList.remove('hidden');
      spk.classList.remove('hidden');
      spk.textContent = 'INCOMING RADIO TRANSMISSION';
      txt.style.opacity = 1;
      txt.textContent = '';
      cin.classList.remove('hidden');

      let ended = false;
      const endIntro = () => {
        if (ended) return;
        ended = true;
        cin.removeEventListener('click', endIntro);
        window.removeEventListener('keydown', onKey);
        cin.classList.add('hidden');
        resolve();
      };
      const onKey = (e) => {
        if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
          e.preventDefault();
          endIntro();
        }
      };
      cin.addEventListener('click', endIntro);
      window.addEventListener('keydown', onKey);

      // Step 1: Radio static + first transmission
      this.game.audio.radioStatic(2.6);
      setTimeout(() => {
        if (ended) return;
        txt.textContent = '"...Arin... if you can hear me..."';
        txt.style.opacity = 1;
      }, 500);

      // Step 2: Pause then second transmission
      setTimeout(() => {
        if (ended) return;
        txt.style.opacity = 0;
      }, 2800);

      setTimeout(() => {
        if (ended) return;
        this.game.audio.radioStatic(2.4);
        txt.textContent = '"...the signal is active again."';
        txt.style.opacity = 1;
      }, 3300);

      // Step 3: Radio beep disconnect, reveal title card
      setTimeout(() => {
        if (ended) return;
        txt.style.opacity = 0;
        this.game.audio.radioBeep();
      }, 5600);

      setTimeout(() => {
        if (ended) return;
        wave.classList.add('hidden');
        spk.classList.add('hidden');
        card.classList.remove('hidden');
        this.game.audio.success();
      }, 6200);

      // Step 4: Finish intro and begin gameplay
      setTimeout(() => {
        if (ended) return;
        endIntro();
      }, 8800);
    });
  }

  radioTransmission(text, dur = 3800) {
    this.game.audio.radioBeep();
    this.game.audio.radioStatic(1.5);
    this.dialogue('RADIO TRANSMISSION', text, dur);
  }
}
