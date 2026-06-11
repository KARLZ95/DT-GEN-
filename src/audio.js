/* ============================================================
 * SFX — moteur audio 100% synthétisé (WebAudio, aucun asset)
 * Tous les sons du GDD : craquements, soupirs, pleurs, pas,
 * claquements, cris binauraux, boîte à musique inversée, etc.
 * ============================================================ */
'use strict';

class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._noiseBuf = null;
    this._staticNode = null;
    this._droneNodes = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    const len = 2 * this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // écho global (cave/couloir) alimenté par les cris
    this._echo = this.ctx.createDelay(1);
    this._echo.delayTime.value = 0.23;
    const fb = this.ctx.createGain(); fb.gain.value = 0.32;
    const wet = this.ctx.createGain(); wet.gain.value = 0.35;
    this._echo.connect(fb); fb.connect(this._echo);
    this._echo.connect(wet); wet.connect(this.master);
    // courbe de distorsion pour les voix
    this._distCurve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      this._distCurve[i] = Math.tanh(x * 4);
    }
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* --- briques de base ------------------------------------ */

  _gainEnv(t0, peak, attack, hold, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.gain.setValueAtTime(Math.max(peak, 0.0001), t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    return g;
  }

  _pan(x, z) {
    // x: -1 gauche / +1 droite ; z: +1 = derrière l'auditeur (HRTF)
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = 0; p.positionZ.value = z;
    } else {
      p.setPosition(x, 0, z);
    }
    return p;
  }

  tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.5, gain = 0.3,
         attack = 0.01, release = 0.2, when = 0, panX = 0, panZ = -0.5,
         filterF = null }) {
    if (!this.ctx) return;
    const t0 = this.now + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    const g = this._gainEnv(t0, gain, attack, Math.max(dur - attack - release, 0.01), release);
    let head = o;
    if (filterF) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterF;
      head.connect(f); head = f;
    }
    const p = this._pan(panX, panZ);
    head.connect(g); g.connect(p); p.connect(this.master);
    o.start(t0); o.stop(t0 + dur + release + 0.1);
  }

  noise({ dur = 0.5, gain = 0.3, type = 'lowpass', f0 = 800, f1 = null, q = 1,
          attack = 0.01, release = 0.2, when = 0, panX = 0, panZ = -0.5 }) {
    if (!this.ctx) return;
    const t0 = this.now + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t0 + dur);
    const g = this._gainEnv(t0, gain, attack, Math.max(dur - attack - release, 0.01), release);
    const p = this._pan(panX, panZ);
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
    src.start(t0); src.stop(t0 + dur + release + 0.1);
    return src;
  }

  /* --- événements basse intensité -------------------------- */

  creak(panX = 0) { // plancher qui craque au loin
    this.tone({ type: 'sawtooth', f0: 110, f1: 62, dur: 0.9, gain: 0.10,
                attack: 0.15, release: 0.5, filterF: 380, panX, panZ: 0.4 });
    this.noise({ dur: 0.7, gain: 0.03, f0: 500, f1: 200, panX, panZ: 0.4 });
  }

  sigh(panX = 0, panZ = 0.8) { // faible soupir féminin
    this.noise({ dur: 1.6, gain: 0.07, type: 'bandpass', f0: 700, f1: 280,
                 q: 4, attack: 0.5, release: 0.7, panX, panZ });
    this.tone({ type: 'sine', f0: 340, f1: 220, dur: 1.4, gain: 0.025,
                attack: 0.5, release: 0.6, panX, panZ });
  }

  buzz() { // grésillement d'ampoule
    this.noise({ dur: 0.25, gain: 0.05, type: 'highpass', f0: 2500, attack: 0.005, release: 0.1 });
    this.tone({ type: 'square', f0: 120, dur: 0.22, gain: 0.02, release: 0.08 });
  }

  doorCreak(panX = 0) {
    this.tone({ type: 'sawtooth', f0: 280, f1: 170, dur: 0.7, gain: 0.08,
                attack: 0.08, release: 0.3, filterF: 900, panX });
  }

  /* --- événements intensité moyenne ------------------------ */

  weep(panX = 0) { // pleurs d'enfant derrière les murs (3 sanglots)
    for (let i = 0; i < 3; i++) {
      const w = i * 0.85;
      this.tone({ type: 'sine', f0: 520 + Math.random() * 60, f1: 380, dur: 0.5,
                  gain: 0.05, attack: 0.12, release: 0.3, when: w, panX, panZ: 0.6 });
      this.noise({ dur: 0.4, gain: 0.02, type: 'bandpass', f0: 900, q: 6,
                   when: w + 0.05, panX, panZ: 0.6 });
    }
  }

  footstep(vol = 0.12, panX = 0, panZ = -0.3) {
    this.noise({ dur: 0.12, gain: vol, f0: 300, f1: 90, attack: 0.003, release: 0.08, panX, panZ });
  }

  splash(vol = 0.14) {
    this.noise({ dur: 0.25, gain: vol, type: 'bandpass', f0: 1400, f1: 500, q: 1.5,
                 attack: 0.004, release: 0.15 });
  }

  mimicSteps(count = 5) { // pas qui imitent le joueur, 1 s de délai (GDD)
    for (let i = 0; i < count; i++) {
      this.noise({ dur: 0.12, gain: 0.08, f0: 260, f1: 80, when: 0.55 * i + 1.0,
                   attack: 0.003, release: 0.08,
                   panX: (Math.random() - 0.5) * 0.4, panZ: 1.0 });
    }
  }

  whoosh(panX = 0) { // passage d'une ombre
    this.noise({ dur: 0.6, gain: 0.10, type: 'bandpass', f0: 250, f1: 1200, q: 2,
                 attack: 0.15, release: 0.3, panX });
  }

  /* --- événements haute intensité --------------------------- */

  slam(panX = 0, vol = 0.5) { // porte qui claque violemment
    this.tone({ type: 'sine', f0: 70, f1: 38, dur: 0.3, gain: vol, attack: 0.004, release: 0.25, panX });
    this.noise({ dur: 0.2, gain: vol * 0.7, f0: 900, f1: 150, attack: 0.002, release: 0.15, panX });
  }

  glassSmash(when = 0) {
    for (let i = 0; i < 6; i++) {
      this.noise({ dur: 0.18, gain: 0.12, type: 'highpass', f0: 3000 + Math.random() * 3000,
                   attack: 0.002, release: 0.12, when: when + Math.random() * 0.4,
                   panX: Math.random() * 2 - 1 });
    }
  }

  staticOn() { // TV qui s'allume à plein volume
    if (!this.ctx || this._staticNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.now);
    g.gain.exponentialRampToValueAtTime(0.4, this.now + 0.03);
    src.connect(g); g.connect(this.master);
    src.start();
    this._staticNode = { src, g };
  }

  staticOff() {
    if (!this._staticNode) return;
    const { src, g } = this._staticNode;
    g.gain.exponentialRampToValueAtTime(0.0001, this.now + 0.15);
    src.stop(this.now + 0.2);
    this._staticNode = null;
  }

  scream(behind = true, vol = 0.7) { // cri binaural 3D distordu (GDD : derrière le joueur)
    const z = behind ? 1.2 : -0.5;
    const t0 = this.now;
    // voix déchirée : dents de scie désaccordées -> waveshaper -> écho
    const sh = this.ctx.createWaveShaper(); sh.curve = this._distCurve;
    const g = this._gainEnv(t0, vol * 0.5, 0.015, 0.45, 0.55);
    const p = this._pan(0, z);
    sh.connect(g); g.connect(p); p.connect(this.master); g.connect(this._echo);
    for (let i = 0; i < 4; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 520 + i * 170 + Math.random() * 40;
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 2.3, t0 + 0.35);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t0 + 1.0);
      // vibrato paniqué
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 11 + i * 2;
      const lg = this.ctx.createGain(); lg.gain.value = f * 0.05;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(sh);
      o.start(t0); o.stop(t0 + 1.2); lfo.start(t0); lfo.stop(t0 + 1.2);
    }
    // souffle strident + chute de basse viscérale
    this.noise({ dur: 1.0, gain: vol * 0.55, type: 'bandpass', f0: 2600, f1: 1400, q: 1.2,
                 attack: 0.015, release: 0.4, panZ: z });
    this.subDrop(vol * 0.9);
  }

  subDrop(vol = 0.5) { // impact sub-bass qui tombe dans le ventre
    this.tone({ type: 'sine', f0: 130, f1: 27, dur: 0.9, gain: vol,
                attack: 0.005, release: 0.5 });
  }

  dreadSwell(dur = 1.6) { // nappe de terreur qui enfle avant un choc
    this.tone({ type: 'sawtooth', f0: 55, f1: 58, dur, gain: 0.16,
                attack: dur * 0.75, release: dur * 0.2, filterF: 300 });
    this.tone({ type: 'sawtooth', f0: 55.8, f1: 52, dur, gain: 0.13,
                attack: dur * 0.75, release: dur * 0.2, filterF: 260 });
    this.noise({ dur, gain: 0.07, type: 'bandpass', f0: 2200, f1: 3400, q: 8,
                 attack: dur * 0.8, release: dur * 0.15 });
  }

  stinger() { // cluster dissonant sec
    [620, 657, 698, 932].forEach((f, i) => {
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.96, dur: 0.5, gain: 0.12,
                  attack: 0.004, release: 0.35, panX: (i - 1.5) * 0.2 });
    });
    this.noise({ dur: 0.4, gain: 0.25, type: 'highpass', f0: 2000, attack: 0.003, release: 0.25 });
  }

  /* Blast saturé (Agent 02) : silence absolu ~80 ms, puis déchirure
   * métallique (FM écrêtée) + os qui craquent + screech, plein volume. */
  shriek(vol = 0.8) {
    if (!this.ctx) return;
    this.blackout(0.08);
    const t0 = this.now + 0.08;
    // déchirure métallique : FM dure passée dans un écrêteur
    const car = this.ctx.createOscillator(); car.type = 'sawtooth';
    car.frequency.setValueAtTime(880, t0);
    car.frequency.exponentialRampToValueAtTime(2300, t0 + 0.18);
    car.frequency.exponentialRampToValueAtTime(420, t0 + 0.5);
    const mod = this.ctx.createOscillator(); mod.frequency.value = 137;
    const mg = this.ctx.createGain(); mg.gain.value = 740;
    mod.connect(mg); mg.connect(car.frequency);
    const clip = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 14);
    clip.curve = curve;
    const g = this._gainEnv(t0, vol * 0.5, 0.004, 0.22, 0.3);
    car.connect(clip); clip.connect(g); g.connect(this.master); g.connect(this._echo);
    car.start(t0); car.stop(t0 + 0.6); mod.start(t0); mod.stop(t0 + 0.6);
    // os qui cèdent
    [0, 0.07, 0.13].forEach(w => {
      this.noise({ dur: 0.05, gain: vol * 0.45, type: 'lowpass', f0: 650,
                   attack: 0.002, release: 0.03, when: 0.08 + w });
      this.noise({ dur: 0.04, gain: vol * 0.3, type: 'highpass', f0: 2600,
                   attack: 0.002, release: 0.025, when: 0.11 + w });
    });
    // screech + impact sub
    this.noise({ dur: 0.45, gain: vol * 0.5, type: 'highpass', f0: 3200,
                 attack: 0.004, release: 0.3, when: 0.08 });
    this.tone({ type: 'sine', f0: 120, f1: 26, dur: 0.7, gain: vol * 0.7,
                attack: 0.004, release: 0.45, when: 0.08 });
  }

  /* pluie continue contre les vitres */
  rain(on) {
    if (!this.ctx) return;
    if (on && !this._rainNodes) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 2600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.now);
      g.gain.linearRampToValueAtTime(0.028, this.now + 2);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = this.ctx.createGain(); lg.gain.value = 0.008;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this._rainNodes = { src, g, lfo };
    } else if (!on && this._rainNodes) {
      const { src, g, lfo } = this._rainNodes;
      g.gain.linearRampToValueAtTime(0.0001, this.now + 1.2);
      src.stop(this.now + 1.4); lfo.stop(this.now + 1.4);
      this._rainNodes = null;
    }
  }

  thunder(dist = 1) { // roulement lointain, retardé après l'éclair
    this.noise({ dur: 3.0, gain: 0.22 / dist, f0: 130, f1: 42, attack: 0.25, release: 1.8 });
    this.tone({ type: 'sine', f0: 44, f1: 30, dur: 2.6, gain: 0.18 / dist, attack: 0.3, release: 1.6 });
  }

  glassCrack() { // verre qui se fissure
    for (let i = 0; i < 4; i++) {
      this.noise({ dur: 0.08, gain: 0.18, type: 'highpass', f0: 5200 - i * 800,
                   attack: 0.002, release: 0.05, when: i * 0.07 });
    }
  }

  ropeCreak() {
    this.tone({ type: 'sawtooth', f0: 160, f1: 120, dur: 0.5, gain: 0.10,
                attack: 0.08, release: 0.25, filterF: 600 });
  }

  neckSnap() {
    this.noise({ dur: 0.06, gain: 0.35, type: 'lowpass', f0: 700, attack: 0.002, release: 0.04 });
    this.noise({ dur: 0.05, gain: 0.22, type: 'highpass', f0: 2400, attack: 0.002,
                 release: 0.03, when: 0.05 });
    this.tone({ type: 'sine', f0: 95, f1: 50, dur: 0.22, gain: 0.4, attack: 0.003, release: 0.16 });
  }

  plink() { // une seule note de boîte à musique, seule dans le noir
    this.tone({ type: 'sine', f0: 1318.5, dur: 0.8, gain: 0.08, attack: 0.004, release: 0.7, panZ: 0.2 });
  }

  glitchBlast() { // blast haute fréquence + statique (GDD jumpscare 02)
    this.tone({ type: 'square', f0: 2800, f1: 3400, dur: 0.45, gain: 0.30,
                attack: 0.003, release: 0.1 });
    this.noise({ dur: 0.5, gain: 0.35, type: 'highpass', f0: 3500, attack: 0.002, release: 0.15 });
  }

  thud() { // tentative sur porte verrouillée
    this.tone({ type: 'sine', f0: 90, f1: 55, dur: 0.18, gain: 0.25, attack: 0.004, release: 0.12 });
  }

  heartbeat() {
    this.tone({ type: 'sine', f0: 55, f1: 40, dur: 0.12, gain: 0.30, attack: 0.005, release: 0.10 });
    this.tone({ type: 'sine', f0: 50, f1: 38, dur: 0.10, gain: 0.22, attack: 0.005, release: 0.09, when: 0.17 });
  }

  /* --- boîte à musique -------------------------------------- */

  musicBox(reversed = false) {
    // Berceuse simple ; jouée à l'envers = notes inversées, désaccordées, ralenties
    const lull = [659.3, 587.3, 523.3, 587.3, 659.3, 659.3, 659.3, 0,
                  587.3, 587.3, 587.3, 0, 659.3, 784.0, 784.0];
    const seq = reversed ? [...lull].reverse() : lull;
    const step = reversed ? 0.34 : 0.26;
    seq.forEach((f, i) => {
      if (!f) return;
      const det = reversed ? 0.97 + Math.random() * 0.02 : 1;
      this.tone({ type: 'sine', f0: f * det, dur: 0.5, gain: 0.07,
                  attack: 0.004, release: 0.4, when: i * step, panZ: 0.2 });
      this.tone({ type: 'sine', f0: f * det * 2, dur: 0.3, gain: 0.02,
                  attack: 0.004, release: 0.25, when: i * step, panZ: 0.2 });
    });
    return seq.length * step;
  }

  /* --- divers ------------------------------------------------ */

  pickup() {
    this.tone({ type: 'triangle', f0: 660, f1: 880, dur: 0.12, gain: 0.10, release: 0.1 });
  }

  paper() {
    this.noise({ dur: 0.25, gain: 0.06, type: 'highpass', f0: 1800, attack: 0.02, release: 0.15 });
  }

  fire() { // objet brûlé dans la chaudière
    this.noise({ dur: 2.2, gain: 0.22, f0: 600, f1: 250, attack: 0.1, release: 1.2 });
    this.noise({ dur: 1.8, gain: 0.10, type: 'highpass', f0: 4000, attack: 0.05, release: 1.0 });
    this.tone({ type: 'sine', f0: 70, f1: 45, dur: 1.8, gain: 0.12, attack: 0.2, release: 1.0 });
  }

  wail() { // hurlement de l'Entité bannie
    this.tone({ type: 'sawtooth', f0: 800, f1: 90, dur: 2.8, gain: 0.30,
                attack: 0.08, release: 1.4, filterF: 1600 });
    this.tone({ type: 'sine', f0: 1100, f1: 120, dur: 2.6, gain: 0.12, attack: 0.1, release: 1.2 });
  }

  rumble() {
    this.tone({ type: 'sine', f0: 42, f1: 30, dur: 2.5, gain: 0.30, attack: 0.3, release: 1.5 });
    this.noise({ dur: 2.2, gain: 0.10, f0: 200, f1: 60, attack: 0.3, release: 1.2 });
  }

  motherStep(dist) { // pas humides de la Mère, volume selon la distance
    const v = Math.min(0.25, 1.6 / (1 + dist * dist * 0.4));
    if (v < 0.01) return;
    this.noise({ dur: 0.2, gain: v, type: 'bandpass', f0: 700, f1: 250, q: 1.5,
                 attack: 0.004, release: 0.14, panZ: 0.3 });
  }

  breathing(dist) {
    const v = Math.min(0.12, 0.8 / (1 + dist * dist * 0.5));
    if (v < 0.01) return;
    this.noise({ dur: 1.2, gain: v, type: 'bandpass', f0: 420, f1: 260, q: 3,
                 attack: 0.4, release: 0.6, panZ: 0.5 });
  }

  /* Silence total (GDD jumpscare 03 : coupure audio de 2 s) */
  blackout(dur = 2.0) {
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.now);
    this.master.gain.setValueAtTime(0.0001, this.now);
    this.master.gain.setValueAtTime(0.0001, this.now + dur - 0.05);
    this.master.gain.exponentialRampToValueAtTime(0.85, this.now + dur);
  }

  /* Nappe d'ambiance continue (room tone) */
  drone(level = 0.04) {
    if (!this.ctx) return;
    if (this._droneNodes) {
      this._droneNodes.g.gain.linearRampToValueAtTime(level, this.now + 1.5);
      return;
    }
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 48;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine'; o2.frequency.value = 0.13; // LFO
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 6;
    o2.connect(lfoG); lfoG.connect(o.frequency);
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.now);
    g.gain.linearRampToValueAtTime(level, this.now + 2);
    o.connect(g); src.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start(); src.start();
    this._droneNodes = { o, o2, src, g };
  }
}

window.SFX = SFX;
