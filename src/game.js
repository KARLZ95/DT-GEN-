/* ============================================================
 * LA MAISON CREUSE — implémentation du GDD horreur DT-GEN
 *
 * - Variable cachée Player_Stress (0..100) -> 3 paliers d'événements
 *   RNG (10% / 30s, 20% / 30s, 35% / 20s) conformes au GDD
 * - 3 jumpscares scriptés : le Miroir, le Berceau, la Cuisine
 * - Acte I  : exploration & gaslighting (objets déplacés)
 * - Acte II : couloir en boucle infinie qui se rétrécit
 * - Acte III: cave inondée, l'Entité (la Mère) chasse le joueur,
 *             brûler 3 objets maudits pour ouvrir la sortie
 *
 * Rendu : raycasting canvas façon VHS (aucun asset externe).
 * ============================================================ */
'use strict';

(() => {

/* ---------------- canvas & constantes ---------------- */
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const W = 640, H = 360;
canvas.width = W; canvas.height = H;
const COL = 2;                  // largeur d'une colonne de rendu
const NRAYS = W / COL;
const FOV = Math.PI / 3;

const sfx = new SFX();

/* ---------------- état global ---------------- */
const G = {
  mode: 'title',                // title | play | note | cut | end
  map: null, mapName: '',
  player: { x: 0, y: 0, a: 0 },
  flash: true,
  stress: 0,                    // Player_Stress (variable cachée du GDD)
  evtTimer: 8,
  fx: { lightMul: 1, flickerT: 0, blood: 0, bloodT: 0, glitchT: 0,
        fade: 1, shake: 0 },
  trans: null,                  // fondu de transition {phase, cb}
  msg: null,                    // {text, t}
  note: null,
  cut: null,                    // cutscene {t, dur, draw, onDone}
  timers: [],                   // [{t, fn}]
  doors: new Map(),
  sprites: [],
  inv: new Set(),
  flags: {},
  burned: 0,
  loops: 0,
  mother: null,
  shadow: null,                 // silhouette fugace {x,y,vx,vy,t}
  tvT: 0,
  heartT: 0,
  stepAcc: 0,
  musicBoxCD: 0,
  prompt: '',
  debug: false,
  zbuf: new Float32Array(NRAYS),
  ended: false,
};

const CURSED = ['album', 'music_box', 'doll'];
const CURSED_LABEL = { album: 'L’album photo', music_box: 'La boîte à musique', doll: 'La poupée' };

/* ---------------- entrées ---------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyF' && G.mode === 'play') G.flash = !G.flash;
  if (e.code === 'F3') { G.debug = !G.debug; e.preventDefault(); }
  if (e.code === 'KeyE') {
    if (G.mode === 'note') { G.note = null; G.mode = 'play'; sfx.paper(); }
    else if (G.mode === 'play') interact();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('click', () => {
  if (G.mode === 'title') startGame();
  if (document.pointerLockElement !== canvas && G.mode !== 'end') {
    canvas.requestPointerLock();
  }
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas && (G.mode === 'play')) {
    G.player.a += e.movementX * 0.0023;
  }
});

/* ---------------- carte & collisions ---------------- */
function tileAt(ix, iy) {
  const g = G.map.grid;
  if (iy < 0 || iy >= g.length || ix < 0 || ix >= g[0].length) return '#';
  let t = g[iy][ix];
  // Acte II : le couloir se rétrécit après chaque boucle (GDD)
  if (G.mapName === 'hall' && t === '.') {
    if (G.loops >= 1 && iy === 3) t = '#';
    if (G.loops >= 2 && iy === 1) t = '#';
  }
  return t;
}

function isSolid(t, ix, iy) {
  if (t === '#' || t === 'M' || t === 'F' || t === 'B') return true;
  if (t === 'd') { const d = G.doors.get(ix + ',' + iy); return !(d && d.open); }
  if (t === 'E') return true;   // la sortie se franchit via [E], jamais en marchant
  return false;
}

function passable(x, y) {
  const t = tileAt(Math.floor(x), Math.floor(y));
  return !isSolid(t, Math.floor(x), Math.floor(y));
}

function loadMap(name, spawn) {
  const m = MAPS[name];
  G.map = m; G.mapName = name;
  G.doors.clear();
  m.grid.forEach((row, iy) => {
    for (let ix = 0; ix < row.length; ix++) {
      if (row[ix] === 'd') G.doors.set(ix + ',' + iy, { open: false });
    }
  });
  G.sprites = (m.sprites || [])
    .filter(s => !G.flags['taken_' + s.id])
    .map(s => ({ ...s }));
  if (name === 'basement') {
    G.sprites.push({ type: 'stairs', id: 'stairs', x: 1.5, y: 1.15 });
    if (!G.flags.purged) {
      G.mother = { x: m.motherSpawn.x, y: m.motherSpawn.y, active: false,
                   path: [], repathT: 0, stepT: 0.4, breathT: 1.5, alpha: 1 };
      addTimer(3, () => { if (G.mother) G.mother.active = true; });
    } else G.mother = null;
  } else G.mother = null;
  const sp = spawn || m.spawn;
  G.player.x = sp.x; G.player.y = sp.y; G.player.a = sp.a;
  G.shadow = null; G.tvT = 0; sfx.staticOff();
  sfx.drone(name === 'basement' ? 0.07 : name === 'hall' ? 0.05 : 0.04);
}

/* ---------------- utilitaires ---------------- */
function addTimer(t, fn) { G.timers.push({ t, fn }); }
function say(text, dur = 4) { G.msg = { text, t: dur }; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2p(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function hash(n) { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }

function fadeTo(cb) {
  if (G.trans) return;
  G.trans = { phase: 0, cb };
}

function lineOfSight(a, b) {
  const d = dist2p(a, b);
  const steps = Math.ceil(d * 4);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps;
    const y = a.y + (b.y - a.y) * i / steps;
    if (!passable(x, y)) return false;
  }
  return true;
}

/* ---------------- raycasting (DDA) ---------------- */
function castRay(px, py, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let ix = Math.floor(px), iy = Math.floor(py);
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (px - ix) * ddx; } else { sx = 1; sdx = (ix + 1 - px) * ddx; }
  if (dy < 0) { sy = -1; sdy = (py - iy) * ddy; } else { sy = 1; sdy = (iy + 1 - py) * ddy; }
  let side = 0;
  for (let i = 0; i < 64; i++) {
    if (sdx < sdy) { sdx += ddx; ix += sx; side = 0; } else { sdy += ddy; iy += sy; side = 1; }
    const t = tileAt(ix, iy);
    if (isSolid(t, ix, iy)) {
      const dist = side === 0 ? sdx - ddx : sdy - ddy;
      const hx = px + dx * dist, hy = py + dy * dist;
      const texX = side === 0 ? hy - Math.floor(hy) : hx - Math.floor(hx);
      return { dist: Math.max(dist, 0.02), tile: t, side, texX, ix, iy };
    }
  }
  return { dist: 40, tile: '#', side: 0, texX: 0, ix, iy };
}

/* ---------------- démarrage ---------------- */
function startGame() {
  sfx.init();
  loadMap('house');
  G.mode = 'play';
  G.fx.fade = 1;
  canvas.requestPointerLock();
  say('La porte d’entrée vient de se verrouiller derrière vous.', 5);
  addTimer(7, () => sfx.creak(0.4));
}

/* ---------------- interaction ---------------- */
function facingSprite() {
  let best = null, bd = 1.8;
  for (const s of G.sprites) {
    const d = dist2p(G.player, s);
    if (d > bd) continue;
    let da = Math.atan2(s.y - G.player.y, s.x - G.player.x) - G.player.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.75) { best = s; bd = d; }
  }
  return best;
}

function facingWall() {
  const r = castRay(G.player.x, G.player.y, G.player.a);
  return r.dist < 2.4 ? r : null;
}

function pickUp(s, label) {
  G.inv.add(s.id);
  G.flags['taken_' + s.id] = true;
  G.sprites = G.sprites.filter(o => o !== s);
  sfx.pickup();
  if (label) say(label);
}

function openNote(id) {
  G.note = TEXTS[id]; G.mode = 'note'; sfx.paper();
}

function interact() {
  const s = facingSprite();
  if (s) {
    switch (s.type) {
      case 'note': openNote(s.id); return;
      case 'album':
        pickUp(s, 'Album photo de famille — récupéré.');
        openNote('album'); return;
      case 'key':
        pickUp(s, 'Clé de la cave — récupérée.'); return;
      case 'fuse':
        pickUp(s, 'Fusible — récupéré.');
        jumpscareKitchen(); return;          // Jumpscare_03 (GDD)
      case 'doll':
        pickUp(s, 'La poupée est gorgée d’eau. Elle sourit.');
        sfx.weep(0.6); G.stress = clamp(G.stress + 8, 0, 100); return;
      case 'cradle':
        if (!G.flags.cradleDone) { jumpscareCradle(); }  // Jumpscare_02 (GDD)
        else if (!G.flags.taken_music_box) {
          G.inv.add('music_box'); G.flags.taken_music_box = true;
          sfx.pickup(); say('Boîte à musique de Lily — récupérée. Elle est glacée.');
        } else say('Le berceau est vide. Définitivement.');
        return;
      case 'tv':
        if (G.tvT > 0) { G.tvT = 0; sfx.staticOff(); say('Le téléviseur s’éteint. L’écran reste tiède.'); }
        else say('Un vieux téléviseur. L’écran vous renvoie une silhouette… la vôtre ?');
        return;
      case 'fusebox':
        if (G.flags.power) { say('Le tableau électrique bourdonne faiblement.'); return; }
        if (G.inv.has('fuse')) {
          G.inv.delete('fuse'); G.flags.power = true;
          sfx.buzz(); say('Le fusible s’enclenche. Les lampes reprennent des couleurs.');
        } else { say('Le tableau électrique. Il manque un fusible.'); failPuzzle(); }
        return;
      case 'stairs':
        fadeTo(() => {
          loadMap('house', { x: 26.5, y: 12.0, a: -Math.PI / 2 });
          say(G.flags.purged ? 'La maison est silencieuse. Vraiment silencieuse.' : 'Vous remontez. L’eau clapote derrière vous.');
        });
        return;
    }
  }
  const w = facingWall();
  if (!w) return;
  const key = w.ix + ',' + w.iy;
  switch (w.tile) {
    case 'd': {
      const d = G.doors.get(key);
      if (d) { d.open = !d.open; sfx.doorCreak(); }
      return;
    }
    case 'B':
      if (G.flags.act2) { say('Derrière la porte : un mur de briques humides. Récentes.'); return; }
      if (G.inv.has('key_basement')) {
        G.flags.act2 = true;
        fadeTo(() => {
          loadMap('hall');
          say('L’escalier de la cave… ne descend pas. C’est un couloir.', 5);
        });
      } else { sfx.thud(); say('Verrouillée. La serrure est ancienne, mais solide.'); failPuzzle(); }
      return;
    case 'E':
      if (G.flags.exitOpen) { endGame(); }
      else { sfx.thud(); say('La porte d’entrée. Verrouillée de l’intérieur… par autre chose.'); failPuzzle(); }
      return;
    case 'F': {
      const carried = CURSED.find(c => G.inv.has(c));
      if (carried) {
        G.inv.delete(carried); G.burned++;
        sfx.fire(); G.fx.flickerT = 1.2;
        G.stress = clamp(G.stress - 12, 0, 100);
        say(CURSED_LABEL[carried] + ' se tord dans les flammes. (' + G.burned + '/3)', 5);
        if (G.burned >= 3) purgeHouse();
      } else { say('La chaudière rugit. Elle attend qu’on la nourrisse.'); }
      return;
    }
    case 'M':
      say('Votre reflet vous fixe. Une demi-seconde de trop.');
      G.stress = clamp(G.stress + 4, 0, 100);
      return;
  }
}

function failPuzzle() { // « failed puzzles » augmentent le stress (GDD)
  G.stress = clamp(G.stress + 6, 0, 100);
}

function purgeHouse() {
  sfx.wail(); sfx.rumble();
  G.fx.glitchT = 0.6; G.fx.shake = 1;
  if (G.mother) { G.mother.active = false; G.mother.dying = true; }
  G.flags.purged = true; G.flags.exitOpen = true;
  addTimer(2.5, () => say('Un long hurlement s’éteint dans les murs. La maison expire.', 6));
  addTimer(6, () => say('La sortie est ouverte.', 5));
}

function endGame() {
  fadeTo(() => { G.mode = 'end'; G.ended = true; document.exitPointerLock(); });
}

/* ---------------- jumpscares scriptés (GDD §3) ---------------- */
function runCut(dur, draw, onDone) {
  G.mode = 'cut';
  G.cut = { t: 0, dur, draw, onDone };
}

/* Jumpscare_01 : « Le Reflet du Miroir » */
function jumpscareMirror() {
  G.flags.j1 = true;
  G.stress = clamp(G.stress + 15, 0, 100);
  addTimer(1.15, () => sfx.scream(true, 0.75)); // cri binaural DERRIÈRE le joueur
  runCut(2.6, (t, c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    // cadre du miroir
    c.fillStyle = '#1a1d22'; c.fillRect(cx - 95, cy - 130, 190, 260);
    c.fillStyle = '#2e3742'; c.fillRect(cx - 85, cy - 120, 170, 240);
    const grad = c.createLinearGradient(cx - 85, 0, cx + 85, 0);
    grad.addColorStop(0, '#39434f'); grad.addColorStop(0.5, '#55616e'); grad.addColorStop(1, '#39434f');
    c.fillStyle = grad; c.fillRect(cx - 85, cy - 120, 170, 240);
    // le reflet : silhouette qui s'arrête, se retourne, puis s'ouvre la gorge
    const turn = clamp((t - 0.7) / 0.5, 0, 1);          // 0 = de dos, 1 = face
    const sxw = Math.cos(turn * Math.PI) * 0.9 + 0.1 * (turn > 0.5 ? -1 : 1);
    c.save(); c.translate(cx, cy + 95); c.scale(Math.max(Math.abs(sxw), 0.15), 1);
    c.fillStyle = '#0c0d10';
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(26, 0); c.lineTo(14, -150); c.lineTo(-14, -150); c.fill();
    c.beginPath(); c.ellipse(0, -165, 13, 16, 0, 0, 7); c.fill();
    if (turn > 0.6) { // visage révélé
      c.fillStyle = '#b8ada2';
      c.beginPath(); c.ellipse(0, -165, 10, 13, 0, 0, 7); c.fill();
      c.fillStyle = '#1a1313';
      c.beginPath(); c.ellipse(-4, -168, 2, 3, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(4, -168, 2, 3, 0, 0, 7); c.fill();
    }
    c.restore();
    // l'entaille : ligne rouge qui s'ouvre sur la gorge
    const cut = clamp((t - 1.25) / 0.5, 0, 1);
    if (cut > 0) {
      c.strokeStyle = '#a3000c'; c.lineWidth = 2 + cut * 3;
      c.beginPath(); c.moveTo(cx - 11 * cut, cy - 58); c.lineTo(cx + 11 * cut, cy - 56); c.stroke();
      c.fillStyle = 'rgba(140,0,8,' + (0.5 * cut) + ')';
      for (let i = 0; i < 4; i++) {
        const dx = -8 + i * 5.5;
        c.fillRect(cx + dx, cy - 55, 2.5, cut * (35 + i * 14));
      }
    }
    if (t > 2.25) { c.fillStyle = 'rgba(0,0,0,' + ((t - 2.25) / 0.35) + ')'; c.fillRect(0, 0, W, H); }
  }, () => {
    say('Le reflet n’a pas suivi. Il a souri d’abord.', 5);
  });
}

/* Jumpscare_02 : « Le Berceau » */
function jumpscareCradle() {
  G.flags.cradleDone = true;
  G.stress = clamp(G.stress + 15, 0, 100);
  sfx.glitchBlast();
  sfx.scream(false, 0.5);
  runCut(1.5, (t, c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    // entité difforme qui jaillit du berceau vers la caméra
    const k = clamp(t / 0.35, 0, 1);
    const s = 8 + k * k * 330;
    const cx = W / 2, cy = H / 2 + 30 - k * 40;
    for (let i = 3; i >= 0; i--) { // traînée de mouvement
      const ks = s * (1 - i * 0.12), al = i === 0 ? 1 : 0.18;
      c.globalAlpha = al;
      c.fillStyle = '#cfc4b8';
      c.beginPath(); c.ellipse(cx, cy, ks * 0.42, ks * 0.55, 0.12, 0, 7); c.fill();
      c.fillStyle = '#0a0708';
      c.beginPath(); c.ellipse(cx - ks * 0.16, cy - ks * 0.12, ks * 0.09, ks * 0.14, 0.3, 0, 7); c.fill();
      c.beginPath(); c.ellipse(cx + ks * 0.13, cy - ks * 0.14, ks * 0.08, ks * 0.12, -0.2, 0, 7); c.fill();
      c.beginPath(); c.ellipse(cx + ks * 0.02, cy + ks * 0.22, ks * 0.11, ks * 0.20, 0, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
    // 0,5 s de statique visuelle (GDD)
    if (t > 0.35 && t < 0.95) {
      for (let i = 0; i < 700; i++) {
        const v = (Math.random() * 220) | 0;
        c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        c.fillRect(Math.random() * W, Math.random() * H, 3, 2);
      }
    }
    if (t > 0.95) { c.fillStyle = 'rgba(0,0,0,' + clamp((t - 0.95) / 0.3, 0, 1) + ')'; c.fillRect(0, 0, W, H); }
  }, () => {
    say('Le berceau est vide. Au fond : une boîte à musique.', 5);
  });
}

/* Jumpscare_03 : « Effondrement de la Cuisine » */
function jumpscareKitchen() {
  G.flags.j3 = true;
  sfx.blackout(2.0);                     // silence absolu de 2 s (GDD)
  addTimer(2.0, () => {
    for (let i = 0; i < 7; i++) {        // placards et tiroirs qui claquent en même temps
      sfx.slam((Math.random() - 0.5) * 1.6, 0.4);
    }
    sfx.glassSmash(0.1);                 // assiettes au sol
    G.stress = clamp(G.stress + 20, 0, 100);
    G.fx.shake = 1; G.fx.flickerT = 1.4;
    runCut(1.5, (t, c) => {
      // le pendu tombe du plafond face caméra, puis disparaît dans le noir
      const drop = clamp(t / 0.22, 0, 1);
      const sway = Math.sin(t * 9) * (1 - t / 1.5) * 14;
      const cy = -260 + drop * 290;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2 + sway, cy);
      c.strokeStyle = '#5a4a33'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(0, -200); c.lineTo(0, 0); c.stroke();
      c.fillStyle = '#11100f';
      c.beginPath(); c.ellipse(0, 22, 15, 19, 0.1, 0, 7); c.fill();      // tête penchée
      c.beginPath(); c.moveTo(-22, 40); c.lineTo(22, 40); c.lineTo(14, 190); c.lineTo(-14, 190); c.fill();
      c.fillStyle = '#9d9287';
      c.beginPath(); c.ellipse(-1, 22, 9, 12, 0.15, 0, 7); c.fill();
      c.fillStyle = '#181314';
      c.fillRect(-5, 18, 3, 4); c.fillRect(2, 17, 3, 4);
      c.restore();
      if (t > 1.0) { c.fillStyle = 'rgba(0,0,0,' + clamp((t - 1.0) / 0.3, 0, 1) + ')'; c.fillRect(0, 0, W, H); }
    }, () => {
      say('Tous les placards sont ouverts. Il n’y a personne au plafond. Plus maintenant.', 5);
    });
  });
}

/* ---------------- événements paranormaux dynamiques (GDD §2) -------- */
function tier() { return G.stress >= 70 ? 2 : G.stress >= 30 ? 1 : 0; }

function scheduleEvents(dt) {
  G.evtTimer -= dt;
  if (G.evtTimer > 0) return;
  const tr = tier();
  G.evtTimer = tr === 2 ? 20 : 30;                       // intervalles du GDD
  const chance = [0.10, 0.20, 0.35][tr];                 // probabilités du GDD
  if (Math.random() < chance) runRandomEvent(tr);
}

function runRandomEvent(tr) {
  const pool = [
    [evCreak, evSigh, evFlicker, evDoorAjar, evDisplace],            // basse intensité
    [evWeep, evMimic, evShadow],                                     // intensité moyenne
    [evBleedWalls, evTvBlast, evDoorSlam],                           // haute intensité
  ][tr];
  pool[(Math.random() * pool.length) | 0]();
}

function evCreak()  { sfx.creak(Math.random() * 1.4 - 0.7); }
function evSigh()   { sfx.sigh(Math.random() * 1.2 - 0.6, 0.9); }
function evFlicker(){ G.fx.flickerT = 1.2 + Math.random(); sfx.buzz(); }

function evDoorAjar() { // une porte entrouverte quand le joueur se retourne
  const cands = [];
  G.doors.forEach((d, k) => {
    if (d.open) return;
    const [x, y] = k.split(',').map(Number);
    let da = Math.atan2(y + 0.5 - G.player.y, x + 0.5 - G.player.x) - G.player.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 1.4) cands.push(d);               // hors du champ de vision
  });
  if (cands.length) { cands[(Math.random() * cands.length) | 0].open = true; sfx.doorCreak(-0.5); }
  else evCreak();
}

function evDisplace() { // Acte I « gaslighting » : objets déplacés hors champ
  const movable = G.sprites.filter(s =>
    ['note', 'key', 'fuse', 'album', 'doll'].includes(s.type));
  for (const s of movable) {
    let da = Math.atan2(s.y - G.player.y, s.x - G.player.x) - G.player.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 1.2) continue;                    // visible : on ne touche pas
    const nx = s.x + (Math.random() * 1.6 - 0.8), ny = s.y + (Math.random() * 1.6 - 0.8);
    if (passable(nx, ny)) { s.x = nx; s.y = ny; sfx.creak(0.2); return; }
  }
}

function evWeep()  { sfx.weep(Math.random() * 1.2 - 0.6); }
function evMimic() { sfx.mimicSteps(4 + (Math.random() * 3 | 0)); }

function evShadow() { // silhouette fugace au bout du couloir
  const d = 5.5;
  const fx = G.player.x + Math.cos(G.player.a) * d;
  const fy = G.player.y + Math.sin(G.player.a) * d;
  if (!passable(fx, fy)) { evWeep(); return; }
  const perp = G.player.a + Math.PI / 2;
  G.shadow = { x: fx, y: fy, vx: Math.cos(perp) * 1.8, vy: Math.sin(perp) * 1.8, t: 1.1 };
  sfx.whoosh(0.3);
}

function evBleedWalls() { G.fx.bloodT = 8; sfx.sigh(0, 1.1); }

function evTvBlast() {
  if (G.mapName === 'house' && G.sprites.some(s => s.type === 'tv')) {
    G.tvT = 3.2; sfx.staticOn();
    addTimer(3.2, () => { if (G.tvT <= 0) return; G.tvT = 0; sfx.staticOff(); });
  } else evDoorSlam();
}

function evDoorSlam() { // porte qui claque violemment devant le joueur
  let best = null, bd = 9;
  G.doors.forEach((d, k) => {
    if (!d.open) return;
    const [x, y] = k.split(',').map(Number);
    const dd = Math.hypot(x + 0.5 - G.player.x, y + 0.5 - G.player.y);
    if (dd < bd) { bd = dd; best = d; }
  });
  if (best) best.open = false;
  sfx.slam(0, 0.55); G.fx.shake = Math.max(G.fx.shake, 0.6);
  G.stress = clamp(G.stress + 4, 0, 100);
}

/* ---------------- la Mère (Acte III) ---------------- */
function bfsPath(from, to) {
  const g = G.map.grid, h = g.length, w = g[0].length;
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  const tx = Math.floor(to.x), ty = Math.floor(to.y);
  const prev = new Int32Array(w * h).fill(-1);
  const q = [sy * w + sx]; prev[sy * w + sx] = sy * w + sx;
  while (q.length) {
    const cur = q.shift();
    if (cur === ty * w + tx) break;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || prev[ni] !== -1) continue;
      if (isSolid(tileAt(nx, ny), nx, ny)) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  const path = []; let cur = ty * w + tx;
  if (prev[cur] === -1) return path;
  while (cur !== sy * w + sx) {
    path.push({ x: cur % w + 0.5, y: ((cur / w) | 0) + 0.5 });
    cur = prev[cur];
  }
  return path.reverse();
}

function updateMother(dt) {
  const m = G.mother;
  if (!m) return;
  if (m.dying) { m.alpha -= dt * 0.5; if (m.alpha <= 0) G.mother = null; return; }
  if (!m.active || G.mode !== 'play') return;
  const d = dist2p(m, G.player);
  const sees = d < 8 && lineOfSight(m, G.player);
  m.repathT -= dt;
  if (m.repathT <= 0) { m.repathT = 0.7; m.path = bfsPath(m, G.player); }
  const sp = sees ? 2.45 : 1.65;
  let target = m.path && m.path.length ? m.path[0] : (sees ? G.player : null);
  if (target) {
    if (m.path.length && dist2p(m, m.path[0]) < 0.3) { m.path.shift(); target = m.path[0] || G.player; }
    const dx = target.x - m.x, dy = target.y - m.y, dd = Math.hypot(dx, dy) || 1;
    const nx = m.x + dx / dd * sp * dt, ny = m.y + dy / dd * sp * dt;
    if (passable(nx, m.y)) m.x = nx;
    if (passable(m.x, ny)) m.y = ny;
  }
  m.stepT -= dt * sp; if (m.stepT <= 0) { m.stepT = 0.55; sfx.motherStep(d); }
  m.breathT -= dt; if (m.breathT <= 0) { m.breathT = 2.4; sfx.breathing(d); }
  if (sees) G.stress = clamp(G.stress + 7 * dt, 0, 100);
  if (d < 0.78) caught();
}

function caught() {
  sfx.scream(false, 0.85);
  G.stress = 100;
  runCut(1.6, (t, c) => {
    // le visage de la Mère engloutit l'écran
    const k = clamp(t / 0.3, 0, 1), s = 30 + k * 380;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    c.fillStyle = '#c9bcae';
    c.beginPath(); c.ellipse(cx, cy, s * 0.40, s * 0.55, 0, 0, 7); c.fill();
    c.fillStyle = '#070506';
    c.beginPath(); c.ellipse(cx - s * 0.15, cy - s * 0.13, s * 0.10, s * 0.16, 0.2, 0, 7); c.fill();
    c.beginPath(); c.ellipse(cx + s * 0.15, cy - s * 0.13, s * 0.10, s * 0.16, -0.2, 0, 7); c.fill();
    c.beginPath(); c.ellipse(cx, cy + s * 0.26, s * 0.13, s * 0.24, 0, 0, 7); c.fill();
    // cheveux trempés
    c.strokeStyle = 'rgba(8,6,7,0.9)'; c.lineWidth = s * 0.04;
    for (let i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(cx + i * s * 0.11, cy - s * 0.5);
      c.quadraticCurveTo(cx + i * s * 0.16, cy, cx + i * s * 0.13, cy + s * 0.5); c.stroke();
    }
    if (t > 1.0) { c.fillStyle = 'rgba(0,0,0,' + clamp((t - 1.0) / 0.4, 0, 1) + ')'; c.fillRect(0, 0, W, H); }
  }, () => {
    const m = MAPS.basement;
    G.player.x = m.spawn.x; G.player.y = m.spawn.y; G.player.a = m.spawn.a;
    if (G.mother) {
      G.mother.x = m.motherSpawn.x; G.mother.y = m.motherSpawn.y;
      G.mother.path = []; G.mother.active = false;
      addTimer(4, () => { if (G.mother) G.mother.active = true; });
    }
    G.stress = 70;
    say('Froid. Noir. Puis l’escalier, de nouveau. Elle vous a rendu à la maison.', 6);
  });
}

/* ---------------- mise à jour ---------------- */
function update(dt) {
  // timers différés
  for (let i = G.timers.length - 1; i >= 0; i--) {
    G.timers[i].t -= dt;
    if (G.timers[i].t <= 0) { const fn = G.timers[i].fn; G.timers.splice(i, 1); fn(); }
  }

  // transition en fondu
  if (G.trans) {
    if (G.trans.phase === 0) {
      G.fx.fade = clamp(G.fx.fade + dt * 2.2, 0, 1);
      if (G.fx.fade >= 1) { G.trans.phase = 1; G.trans.cb(); }
    } else {
      G.fx.fade = clamp(G.fx.fade - dt * 1.6, 0, 1);
      if (G.fx.fade <= 0) G.trans = null;
    }
  } else if (G.fx.fade > 0 && G.mode === 'play') {
    G.fx.fade = clamp(G.fx.fade - dt * 1.2, 0, 1);
  }

  // effets visuels
  if (G.fx.flickerT > 0) {
    G.fx.flickerT -= dt;
    G.fx.lightMul = 0.25 + Math.random() * 0.75;
  } else G.fx.lightMul = 1;
  if (G.fx.bloodT > 0) { G.fx.bloodT -= dt; G.fx.blood = clamp(G.fx.blood + dt * 1.5, 0, 1); }
  else G.fx.blood = clamp(G.fx.blood - dt * 0.4, 0, 1);
  if (G.fx.glitchT > 0) G.fx.glitchT -= dt;
  G.fx.shake = Math.max(0, G.fx.shake - dt * 2.5);
  if (G.tvT > 0) { G.tvT -= dt; if (G.tvT <= 0) sfx.staticOff(); }
  if (G.msg) { G.msg.t -= dt; if (G.msg.t <= 0) G.msg = null; }
  if (G.musicBoxCD > 0) G.musicBoxCD -= dt;

  if (G.cut) {
    G.cut.t += dt;
    if (G.cut.t >= G.cut.dur) {
      const done = G.cut.onDone; G.cut = null; G.mode = 'play';
      if (done) done();
    }
    return;
  }
  if (G.mode !== 'play') return;

  const p = G.player;

  // déplacements (ZQSD / WASD via codes physiques)
  const fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const st = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (keys.ArrowLeft) p.a -= 2.2 * dt;
  if (keys.ArrowRight) p.a += 2.2 * dt;
  const fwk = fw || (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  let speed = G.map.water ? 2.1 : 2.8;
  if (fwk || st) {
    const mx = (Math.cos(p.a) * fwk + Math.cos(p.a + Math.PI / 2) * st);
    const my = (Math.sin(p.a) * fwk + Math.sin(p.a + Math.PI / 2) * st);
    const len = Math.hypot(mx, my) || 1;
    const nx = p.x + mx / len * speed * dt;
    const ny = p.y + my / len * speed * dt;
    const R = 0.22;
    if (passable(nx + Math.sign(mx) * R, p.y)) p.x = nx;
    if (passable(p.x, ny + Math.sign(my) * R)) p.y = ny;
    G.stepAcc += speed * dt;
    if (G.stepAcc > 0.62) {
      G.stepAcc = 0;
      if (G.map.water) sfx.splash(); else sfx.footstep(0.07);
    }
  }

  /* ----- Player_Stress (GDD §2) ----- */
  const centerRay = castRay(p.x, p.y, p.a);
  const ambientNow = G.map.ambient * (G.flags.power && G.mapName === 'house' ? 1.5 : 1) * G.fx.lightMul;
  const inDark = (!G.flash && ambientNow < 0.3) || ambientNow < 0.07;
  let dStress = 0;
  if (inDark) dStress += 1.3;                    // temps passé dans le noir
  if (centerRay.dist < 0.85) dStress += 1.6;     // face contre un mur
  if (dStress === 0) dStress = -0.55;            // décompression lente
  G.stress = clamp(G.stress + dStress * dt, 0, 100);

  // battements de cœur quand le stress grimpe
  if (G.stress > 55) {
    G.heartT -= dt * (0.7 + G.stress / 80);
    if (G.heartT <= 0) { G.heartT = 1; sfx.heartbeat(); }
  }

  scheduleEvents(dt);

  // silhouette fugace
  if (G.shadow) {
    G.shadow.x += G.shadow.vx * dt; G.shadow.y += G.shadow.vy * dt;
    G.shadow.t -= dt; if (G.shadow.t <= 0) G.shadow = null;
  }

  /* ----- déclencheurs scriptés ----- */
  if (G.mapName === 'house') {
    // Jumpscare_01 : clé de la cave EN POSSESSION + entrée dans le couloir
    const z = G.map.mirrorZone;
    if (!G.flags.j1 && G.inv.has('key_basement') &&
        p.x > z.x0 && p.x < z.x1 && p.y > z.y0 && p.y < z.y1) {
      jumpscareMirror();
      return;
    }
    // boîte à musique à l'envers à l'approche du berceau
    if (!G.flags.cradleDone && G.musicBoxCD <= 0) {
      const cr = G.sprites.find(s => s.type === 'cradle');
      if (cr && dist2p(p, cr) < 3.4) { sfx.musicBox(true); G.musicBoxCD = 26; }
    }
  }

  if (G.mapName === 'hall') {
    // Acte II : boucle infinie, le couloir se referme
    if (p.x > 24.2) {
      if (G.loops < 3) {
        G.loops++;
        p.x = 1.6; p.y = 2.5;
        if (G.loops === 1) { sfx.mimicSteps(5); G.fx.flickerT = 1.5; say('Le même couloir. Encore.'); }
        if (G.loops === 2) {
          sfx.weep(0.4); say('Les murs sont plus proches qu’avant.');
          G.shadow = { x: 22, y: 2.5, vx: 0, vy: 0, t: 2.2 };
        }
        if (G.loops === 3) { sfx.sigh(0, 1.3); sfx.slam(0, 0.5); say('Il n’y a presque plus de place. Continuez.'); }
        G.stress = clamp(G.stress + 8, 0, 100);
      } else {
        fadeTo(() => {
          G.loops = 0;
          loadMap('basement');
          say('La cave. L’eau monte. Quelque chose berce le noir.', 6);
        });
      }
    }
  }

  updateMother(dt);
  updatePrompt();
}

function updatePrompt() {
  G.prompt = '';
  const s = facingSprite();
  if (s) {
    G.prompt = {
      note: '[E] Lire', album: '[E] Prendre l’album', key: '[E] Prendre la clé',
      fuse: '[E] Prendre le fusible', doll: '[E] Prendre la poupée',
      cradle: G.flags.cradleDone && !G.flags.taken_music_box ? '[E] Fouiller le berceau' : '[E] Regarder dans le berceau',
      tv: '[E] Téléviseur', fusebox: '[E] Tableau électrique', stairs: '[E] Remonter l’escalier',
    }[s.type] || '';
    if (G.prompt) return;
  }
  const w = facingWall();
  if (!w) return;
  if (w.tile === 'd') G.prompt = G.doors.get(w.ix + ',' + w.iy)?.open ? '[E] Fermer la porte' : '[E] Ouvrir la porte';
  else if (w.tile === 'B') G.prompt = '[E] Porte de la cave';
  else if (w.tile === 'E') G.prompt = G.flags.exitOpen ? '[E] Sortir' : '[E] Porte d’entrée';
  else if (w.tile === 'F') G.prompt = '[E] Chaudière';
  else if (w.tile === 'M' && w.dist < 1.8) G.prompt = '[E] Miroir';
}

/* ---------------- rendu ---------------- */
const WALLCOL = {
  house: [124, 112, 95], hall: [99, 93, 86], basement: [76, 78, 86],
};
const TILECOL = {
  d: [106, 73, 45], B: [72, 57, 46], E: [92, 79, 60], M: [152, 167, 182], F: [58, 53, 50],
};

function shade(c, l) {
  return 'rgb(' + ((c[0] * l) | 0) + ',' + ((c[1] * l) | 0) + ',' + ((c[2] * l) | 0) + ')';
}

// canvases de grain pré-générés
const grain = [];
for (let i = 0; i < 4; i++) {
  const cnv = document.createElement('canvas');
  cnv.width = 160; cnv.height = 90;
  const c2 = cnv.getContext('2d');
  const img = c2.createImageData(160, 90);
  for (let j = 0; j < img.data.length; j += 4) {
    const v = Math.random() * 255;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255;
  }
  c2.putImageData(img, 0, 0);
  grain.push(cnv);
}

function render(time) {
  const p = G.player;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

  if (G.mode === 'title') { drawTitle(time); return; }
  if (G.mode === 'end') { drawEnd(time); return; }

  const shx = (Math.random() - 0.5) * G.fx.shake * 10;
  const shy = (Math.random() - 0.5) * G.fx.shake * 8;
  ctx.save(); ctx.translate(shx, shy);

  const amb = G.map.ambient * (G.flags.power && G.mapName === 'house' ? 1.5 : 1)
            * G.fx.lightMul * (G.mapName === 'hall' ? Math.max(0.35, 1 - G.loops * 0.22) : 1);

  /* plafond */
  let grd = ctx.createLinearGradient(0, 0, 0, H / 2);
  grd.addColorStop(0, shade([26, 24, 22], amb * 2.2 + 0.12));
  grd.addColorStop(1, '#000');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H / 2);

  /* sol (eau dans la cave) */
  if (G.map.water) {
    grd = ctx.createLinearGradient(0, H / 2, 0, H);
    grd.addColorStop(0, '#02060a');
    grd.addColorStop(1, shade([18, 38, 48], amb * 3 + 0.25));
    ctx.fillStyle = grd; ctx.fillRect(0, H / 2, W, H / 2);
    ctx.strokeStyle = 'rgba(90,140,160,0.10)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = H / 2 + 18 + i * 22 + Math.sin(time * 0.0012 + i * 1.7) * 5;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + time * 0.002 + i) * 3);
      ctx.stroke();
    }
    if (G.flash) { // reflet de la lampe sur l'eau
      const rg = ctx.createRadialGradient(W / 2, H * 0.82, 8, W / 2, H * 0.82, 130);
      rg.addColorStop(0, 'rgba(190,200,210,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, H / 2, W, H / 2);
    }
  } else {
    grd = ctx.createLinearGradient(0, H / 2, 0, H);
    grd.addColorStop(0, '#040302');
    grd.addColorStop(1, shade([52, 42, 32], amb * 2.4 + 0.18));
    ctx.fillStyle = grd; ctx.fillRect(0, H / 2, W, H / 2);
  }

  /* murs */
  const bob = Math.sin(G.stepAcc * 9) * 1.5;
  for (let i = 0; i < NRAYS; i++) {
    const off = (i / NRAYS - 0.5) * FOV;
    const r = castRay(p.x, p.y, p.a + off);
    const d = r.dist * Math.cos(off);
    G.zbuf[i] = d;
    const lineH = H / d;
    const top = H / 2 - lineH / 2 + bob;
    const att = 1 / (1 + d * d * 0.055);
    const beam = G.flash ? Math.max(0, 1 - (off / 0.5) ** 2) * 1.15 : 0;
    let light = clamp((amb + beam * att) * att * 3.2, 0.015, 1.15);
    if (r.side === 1) light *= 0.82;
    // micro-texture déterministe
    light *= 0.82 + 0.36 * hash(r.ix * 127.1 + r.iy * 311.7 + ((r.texX * 9) | 0) * 73.7);
    let col = TILECOL[r.tile] || WALLCOL[G.mapName] || WALLCOL.house;
    if (r.tile === 'M') { // reflet du miroir
      light *= 1.15;
      if (r.texX > 0.42 && r.texX < 0.56) light *= 1.6;
    }
    if (G.fx.blood > 0) { // murs qui saignent
      const b = G.fx.blood * (0.55 + 0.45 * hash(r.ix * 17.3 + r.iy * 9.1));
      col = [col[0] * (1 - b) + 115 * b, col[1] * (1 - b) + 8 * b, col[2] * (1 - b) + 10 * b];
    }
    ctx.fillStyle = shade(col, light);
    ctx.fillRect(i * COL, top, COL, lineH);
    if (r.tile === 'F') { // braises de la chaudière
      const fl = 0.6 + 0.4 * Math.random();
      ctx.fillStyle = 'rgba(' + (210 * fl | 0) + ',' + (95 * fl | 0) + ',15,' + (att * 0.9) + ')';
      ctx.fillRect(i * COL, top + lineH * 0.55, COL, lineH * 0.45);
    }
    if (r.tile === 'E' && G.flags.exitOpen) { // lumière du dehors
      ctx.fillStyle = 'rgba(200,205,190,' + (att * 0.5) + ')';
      ctx.fillRect(i * COL, top + lineH * 0.15, COL, lineH * 0.7);
    }
  }

  drawSprites(amb, bob, time);
  ctx.restore();

  drawPost(time);
  drawHUD();
}

/* ---- sprites (objets, ombres, la Mère) ---- */
function drawSprites(amb, bob, time) {
  const p = G.player;
  const list = [...G.sprites];
  if (G.shadow) list.push({ type: 'shadow', ...G.shadow });
  if (G.mother) list.push({ type: 'mother', ref: G.mother, x: G.mother.x, y: G.mother.y });
  const dirX = Math.cos(p.a), dirY = Math.sin(p.a);
  const plX = -dirY * Math.tan(FOV / 2), plY = dirX * Math.tan(FOV / 2);
  const invDet = 1 / (plX * dirY - dirX * plY);
  list
    .map(s => {
      const dx = s.x - p.x, dy = s.y - p.y;
      const tx = invDet * (dirY * dx - dirX * dy);
      const ty = invDet * (-plY * dx + plX * dy);
      return { s, tx, ty };
    })
    .filter(o => o.ty > 0.15)
    .sort((a, b) => b.ty - a.ty)
    .forEach(({ s, tx, ty }) => {
      const sx = (W / 2) * (1 + tx / ty);
      const ci = clamp((sx / COL) | 0, 0, NRAYS - 1);
      if (G.zbuf[ci] < ty - 0.25) return;          // occlusion
      const size = H / ty;
      const floorY = H / 2 + size / 2 + bob;
      const att = 1 / (1 + ty * ty * 0.055);
      const beam = G.flash ? Math.max(0, 1 - ((sx - W / 2) / (W / 2) * (FOV / 2) / 0.5) ** 2) * 1.15 : 0;
      const light = clamp((amb + beam * att) * att * 3.4, 0.03, 1.1);
      drawSpriteShape(s, sx, floorY, size, light, time);
    });
}

function drawSpriteShape(s, sx, fy, size, light, time) {
  const u = size / 100;     // 100 unités = 1 case de haut
  ctx.save(); ctx.translate(sx, fy); ctx.scale(u, u);
  const bobble = Math.sin(time * 0.003 + sx) * 1.5;
  switch (s.type) {
    case 'note':
      ctx.fillStyle = shade([225, 218, 200], light);
      ctx.fillRect(-7, -14 + bobble * 0.3, 14, 11);
      break;
    case 'album':
      ctx.fillStyle = shade([96, 58, 38], light);
      ctx.fillRect(-12, -16, 24, 14);
      ctx.fillStyle = shade([160, 140, 110], light);
      ctx.fillRect(-9, -13, 18, 8);
      break;
    case 'key':
      ctx.strokeStyle = shade([190, 160, 80], light); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -16 + bobble * 0.3, 5, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -11 + bobble * 0.3); ctx.lineTo(0, -2); ctx.lineTo(5, -2); ctx.stroke();
      break;
    case 'fuse':
      ctx.fillStyle = shade([160, 40, 30], light);
      ctx.fillRect(-5, -18, 10, 16);
      ctx.fillStyle = shade([150, 150, 155], light);
      ctx.fillRect(-5, -19, 10, 3); ctx.fillRect(-5, -4, 10, 3);
      break;
    case 'doll':
      ctx.fillStyle = shade([200, 185, 170], light);
      ctx.beginPath(); ctx.ellipse(0, -22, 7, 8, 0, 0, 7); ctx.fill();
      ctx.fillRect(-6, -16, 12, 14);
      ctx.fillStyle = shade([20, 14, 14], light);
      ctx.fillRect(-3.5, -24, 2, 2); ctx.fillRect(1.5, -24, 2, 2);
      break;
    case 'cradle':
      ctx.fillStyle = shade([74, 50, 34], light);
      ctx.fillRect(-26, -34, 52, 26);
      ctx.strokeStyle = shade([74, 50, 34], light); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, -4, 27, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = shade([30, 24, 22], light);
      ctx.fillRect(-22, -31, 44, 20);
      break;
    case 'tv': {
      ctx.fillStyle = shade([52, 50, 48], light);
      ctx.fillRect(-20, -34, 40, 30);
      if (G.tvT > 0) {
        for (let i = 0; i < 60; i++) {
          const v = Math.random() * 230 | 0;
          ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          ctx.fillRect(-17 + Math.random() * 34, -31 + Math.random() * 24, 3, 2);
        }
      } else {
        ctx.fillStyle = shade([18, 22, 24], light);
        ctx.fillRect(-17, -31, 34, 24);
      }
      break;
    }
    case 'fusebox':
      ctx.fillStyle = shade([110, 112, 116], light);
      ctx.fillRect(-12, -52, 24, 30);
      ctx.fillStyle = G.flags.power ? 'rgba(120,220,120,0.8)' : 'rgba(220,60,40,0.7)';
      ctx.fillRect(-3, -48, 6, 4);
      break;
    case 'stairs':
      ctx.strokeStyle = shade([130, 120, 105], light); ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(-16, -10 - i * 14); ctx.lineTo(16, -10 - i * 14); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-16, -72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, -2); ctx.lineTo(16, -72); ctx.stroke();
      break;
    case 'shadow':
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#020203';
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(8, -80); ctx.lineTo(-8, -80); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -88, 8, 10, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'mother': {
      const m = s.ref;
      ctx.globalAlpha = m.alpha;
      const sway = Math.sin(time * 0.004) * 0.06;
      ctx.rotate(sway);
      ctx.fillStyle = shade([14, 12, 14], Math.max(light, 0.10) * 2);
      ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.lineTo(9, -88); ctx.lineTo(-9, -88); ctx.fill();
      ctx.fillStyle = shade([185, 172, 160], Math.max(light, 0.08));
      ctx.beginPath(); ctx.ellipse(0, -95, 8, 11, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(6,5,6,0.95)'; ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 3.5, -105);
        ctx.quadraticCurveTo(i * 6, -70, i * 5, -42); ctx.stroke();
      }
      ctx.fillStyle = '#050304';
      ctx.beginPath(); ctx.ellipse(-3, -97, 1.8, 2.6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -97, 1.8, 2.6, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
  }
  ctx.restore();
}

/* ---- post-traitement : vignette, grain, scanlines, glitch, fondu ---- */
function drawPost(time) {
  // vignette dont l'intensité suit Player_Stress
  const v = 0.45 + (G.stress / 100) * 0.4;
  const rg = ctx.createRadialGradient(W / 2, H / 2, H * (0.75 - G.stress / 100 * 0.25), W / 2, H / 2, H * 0.95);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(1, 'rgba(' + (G.stress > 70 ? 25 : 0) + ',0,0,' + v + ')');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  // grain VHS
  ctx.globalAlpha = 0.055;
  ctx.drawImage(grain[(time / 50 | 0) % 4], 0, 0, W, H);
  ctx.globalAlpha = 1;

  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

  // glitch
  if (G.fx.glitchT > 0) {
    for (let i = 0; i < 7; i++) {
      const y = Math.random() * H, h = 4 + Math.random() * 14;
      const sh = (Math.random() - 0.5) * 40;
      ctx.drawImage(canvas, 0, y, W, h, sh, y, W, h);
    }
    for (let i = 0; i < 160; i++) {
      const vv = Math.random() * 255 | 0;
      ctx.fillStyle = 'rgba(' + vv + ',' + vv + ',' + vv + ',0.5)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 4, 2);
    }
  }

  if (G.cut) G.cut.draw(G.cut.t, ctx);

  if (G.fx.fade > 0) {
    ctx.fillStyle = 'rgba(0,0,0,' + G.fx.fade + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---- HUD ---- */
function drawHUD() {
  if (G.cut) return;
  ctx.textAlign = 'center';

  if (G.mode === 'play') {
    if (G.prompt) {
      ctx.font = '13px Georgia, serif';
      ctx.fillStyle = 'rgba(230,225,210,0.85)';
      ctx.fillText(G.prompt, W / 2, H - 28);
    }
    // point de visée discret
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
    if (!G.flash) {
      ctx.font = '10px Georgia, serif';
      ctx.fillStyle = 'rgba(160,150,140,0.4)';
      ctx.fillText('lampe éteinte — [F]', W / 2, 16);
    }
  }

  if (G.msg) {
    ctx.font = 'italic 14px Georgia, serif';
    ctx.fillStyle = 'rgba(225,218,200,' + clamp(G.msg.t, 0, 1) + ')';
    ctx.fillText(G.msg.text, W / 2, H - 52);
  }

  if (G.mode === 'note' && G.note) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
    const px = W / 2 - 215, py = 38, pw = 430, ph = H - 76;
    ctx.fillStyle = '#d8cfb8'; ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#c4b89e'; ctx.fillRect(px, py, pw, 4);
    ctx.fillStyle = '#3a3026';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.fillText(G.note.title, W / 2, py + 30);
    ctx.font = '12px Georgia, serif';
    G.note.body.forEach((line, i) => ctx.fillText(line, W / 2, py + 58 + i * 19));
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillStyle = '#6b5f4e';
    ctx.fillText('[E] refermer', W / 2, py + ph - 14);
  }

  if (G.debug) {
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#7f7';
    ctx.fillText('Stress=' + G.stress.toFixed(1) + ' palier=' + (tier() + 1)
      + ' evt=' + G.evtTimer.toFixed(1) + 's map=' + G.mapName
      + ' boucles=' + G.loops + ' brûlés=' + G.burned, 8, 14);
    ctx.fillText('inv: ' + [...G.inv].join(', '), 8, 28);
  }

  if (G.mode === 'play' && document.pointerLockElement !== canvas) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.font = '15px Georgia, serif'; ctx.fillStyle = '#cfc8b8'; ctx.textAlign = 'center';
    ctx.fillText('Cliquez pour reprendre', W / 2, H / 2);
  }
}

/* ---- écrans titre & fin ---- */
function drawTitle(time) {
  ctx.textAlign = 'center';
  const pulse = 0.6 + Math.sin(time * 0.002) * 0.2;
  ctx.font = '34px Georgia, serif';
  ctx.fillStyle = 'rgba(190,30,30,0.9)';
  ctx.fillText('LA MAISON CREUSE', W / 2, 110);
  ctx.font = 'italic 13px Georgia, serif';
  ctx.fillStyle = 'rgba(170,162,148,0.8)';
  ctx.fillText('un scénario d’horreur psychologique — DT-GEN', W / 2, 136);
  ctx.font = '12px Georgia, serif';
  ctx.fillStyle = 'rgba(150,144,132,0.75)';
  const lines = [
    'ZQSD / WASD — se déplacer        souris — regarder',
    'E — interagir / lire        F — lampe torche',
    '',
    'Reconstituez le drame de cette famille pour déverrouiller la sortie.',
    'La maison écoute. Elle mesure votre peur.',
    '(casque audio fortement recommandé)',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 190 + i * 20));
  ctx.font = '15px Georgia, serif';
  ctx.fillStyle = 'rgba(220,212,195,' + pulse + ')';
  ctx.fillText('— cliquez pour entrer —', W / 2, 330);
  ctx.globalAlpha = 0.05;
  ctx.drawImage(grain[(time / 60 | 0) % 4], 0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawEnd(time) {
  if (!G.endStart) G.endStart = time;
  const t = (time - G.endStart) / 1000;
  ctx.textAlign = 'center';
  ctx.font = '30px Georgia, serif';
  ctx.fillStyle = 'rgba(200,195,180,' + clamp(t / 2, 0, 1) + ')';
  ctx.fillText('VOUS ÊTES SORTI', W / 2, 120);
  const epilogue = [
    'Derrière vous, la maison ne hurle plus.',
    'Éléanore et Lily se sont noyées dans la cave, une nuit de crue,',
    'pendant que la maison dormait à clé.',
    'Vous avez brûlé ce qui les retenait. Il ne reste que des cendres,',
    'de l’eau calme, et un berceau qui ne grince plus.',
    '',
    'Personne ne rachètera cette maison. Mais elle, enfin, est vide.',
  ];
  ctx.font = 'italic 13px Georgia, serif';
  epilogue.forEach((l, i) => {
    const a = clamp((t - 1.5 - i * 0.7) / 1.2, 0, 0.85);
    ctx.fillStyle = 'rgba(165,158,144,' + a + ')';
    ctx.fillText(l, W / 2, 175 + i * 22);
  });
  ctx.globalAlpha = 0.04;
  ctx.drawImage(grain[(time / 60 | 0) % 4], 0, 0, W, H);
  ctx.globalAlpha = 1;
}

/* ---------------- boucle principale ---------------- */
let last = 0;
function frame(time) {
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;
  const paused = G.mode === 'play' && document.pointerLockElement !== canvas;
  if (!paused) update(dt);
  render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__G = G; // accès debug console

})();
