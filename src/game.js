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
 * Rendu : raycasting texturé par pixel (murs + sols/plafonds
 * projetés), textures procédurales, éclairage dynamique,
 * poussière volumétrique. Aucun asset externe.
 * ============================================================ */
'use strict';

(() => {

/* ---------------- canvas & constantes ---------------- */
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const W = 960, H = 540;            // résolution d'affichage (HUD, sprites, cutscenes)
canvas.width = W; canvas.height = H;
const RW = 480, RH = 270;          // résolution du monde 3D (rendu par pixel)
const FOV = Math.PI / 3;
const TANF = Math.tan(FOV / 2);
const CAMZ = RH / 2;

const world = document.createElement('canvas');
world.width = RW; world.height = RH;
const wctx = world.getContext('2d');
const wimg = wctx.createImageData(RW, RH);
const px32 = new Uint32Array(wimg.data.buffer);

const sfx = new SFX();

/* table de sinus rapide pour les effets par pixel */
const SINT = new Float32Array(4096);
for (let i = 0; i < 4096; i++) SINT[i] = Math.sin(i / 4096 * Math.PI * 2);
const sinT = v => SINT[((v * 651.8986) | 0) & 4095];

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
  trans: null,
  msg: null,
  note: null,
  cut: null,
  timers: [],
  doors: new Map(),
  sprites: [],
  inv: new Set(),
  flags: {},
  burned: 0,
  loops: 0,
  mother: null,
  shadow: null,
  tvT: 0,
  heartT: 0,
  stepAcc: 0,
  musicBoxCD: 0,
  prompt: '',
  debug: false,
  zbuf: new Float32Array(RW),
  ended: false,
  // Agent 03 — télémétrie : fenêtre de vulnérabilité du joueur
  scareCD: 25,        // anti-répétition des micro-scares
  lastA: 0,           // pour la vitesse angulaire de la caméra
  appar: null,        // apparition flash {t, side}
  rockT: 0,           // le rocking-chair se balance tout seul
  lightning: 0,       // éclat d'éclair (0..1)
  thunderT: 18,
};

/* Agent 01+02 : apparition flash, anatomie distordue + blast saturé */
function microScare() {
  G.appar = { t: 0.17, side: Math.random() < 0.5 ? -1 : 1 };
  sfx.shriek(0.5);
  G.stress = clamp(G.stress + 8, 0, 100);
  G.scareCD = 45 + Math.random() * 35;
}

/* gel d'images façon « 60 FPS -> 0 FPS » pendant les bursts (Agent 01) */
function gT(t) {
  const f = Math.floor(t * 28);
  return hash(f * 3.7) < 0.38 ? f / 28 : t;
}

const CURSED = ['album', 'music_box', 'doll'];
const CURSED_LABEL = { album: 'L’album photo', music_box: 'La boîte à musique', doll: 'La poupée' };
const BURN_TEXT = {
  album: 'L’album se tord. Les visages d’Éléanore et de Lily noircissent un à un.',
  music_box: 'La berceuse fond en gouttes de laiton. Là-haut, le berceau s’arrête de grincer.',
  doll: 'La poupée siffle dans les flammes. Un dernier sanglot — puis plus rien.',
};

/* ---------------- textures procédurales ---------------- */
const TEX = {};
(() => {
  const S = 64;
  const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = t => t * t * (3 - 2 * t);
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o = 4) {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < o; i++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2; }
    return s;
  }
  const cl = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  function make(fn) {
    const t = new Uint32Array(S * S);
    for (let pv = 0; pv < S; pv++) for (let pu = 0; pu < S; pu++) {
      const [r, g, b] = fn(pu / S, pv / S);
      t[pv * S + pu] = cl(r) | (cl(g) << 8) | (cl(b) << 16);
    }
    return t;
  }

  // papier peint défraîchi + lambris en bas (maison)
  TEX.wallpaper = make((u, v) => {
    if (v > 0.86) { // plinthe en bois sombre
      const g = fbm(u * 9, v * 30) * 26;
      return [70 + g, 50 + g * 0.7, 34 + g * 0.5];
    }
    if (v > 0.845) return [26, 22, 19]; // moulure
    let r = 138, g = 122, b = 100;
    if (Math.sin(u * Math.PI * 8) > 0.45) { r -= 11; g -= 10; b -= 8; }   // rayures
    const motif = Math.sin(u * Math.PI * 8) * Math.sin(v * Math.PI * 9 + Math.sin(u * Math.PI * 4));
    if (motif > 0.55) { r += 9; g += 8; b += 5; }                          // motif damassé
    const m = (0.72 + 0.42 * fbm(u * 3 + 5, v * 3 + 9))                    // taches d'humidité
            * (1 - 0.30 * Math.max(0, (v - 0.5) / 0.35));                  // salissure basse
    return [r * m, g * m, b * m];
  });

  // papier peint largement arraché : cloison moisie à nu
  TEX.wallpaper2 = make((u, v) => {
    const peel = fbm(u * 2.2 + 14, v * 2.2 + 61);
    if (peel > 0.42) { // zone arrachée -> placo humide, moisissures noires-vertes
      let r = 96, g = 92, b = 84;
      const m = 0.7 + 0.4 * fbm(u * 5 + 3, v * 5 + 8);
      r *= m; g *= m; b *= m;
      const mold = fbm(u * 4 + 27, v * 4 + 91);
      if (mold > 0.55) { const k = (mold - 0.55) * 2.4; r *= 1 - k * 0.8; g *= 1 - k * 0.45; b *= 1 - k * 0.75; g += k * 14; }
      if (peel < 0.47) { r += 46; g += 40; b += 30; } // tranche déchirée du papier
      return [r, g, b];
    }
    let r = 134, g = 118, b = 96;
    if (Math.sin(u * Math.PI * 8) > 0.45) { r -= 11; g -= 10; b -= 8; }
    const m = (0.62 + 0.42 * fbm(u * 3 + 5, v * 3 + 9));
    return [r * m, g * m, b * m];
  });

  // papier peint strié de coulures d'eau
  TEX.wallpaper3 = make((u, v) => {
    let r = 132, g = 116, b = 95;
    if (Math.sin(u * Math.PI * 8) > 0.45) { r -= 10; g -= 9; b -= 7; }
    const m0 = 0.74 + 0.36 * fbm(u * 3 + 44, v * 3 + 2);
    let m = m0;
    const drip = fbm(u * 11 + 9, 0.5, 3);                                  // colonnes de coulure
    if (drip > 0.52) {
      const depth = Math.min(1, (drip - 0.52) * 5) * Math.min(1, v * 2.2 + 0.25);
      m *= 1 - depth * 0.42; b *= 1 - depth * 0.1;
    }
    if (v > 0.86) { const gg = fbm(u * 9, v * 30) * 26; return [66 + gg, 47 + gg * 0.7, 32 + gg * 0.5]; }
    if (v > 0.845) return [24, 20, 18];
    return [r * m, g * m, b * m];
  });

  // fenêtre condamnée : planches + fentes de clair de lune (pixels émissifs)
  TEX.window = make((u, v) => {
    const board = (v * 4.6 + Math.sin(u * 3) * 0.06) % 1;
    if (board > 0.82) return [222, 232, 255];                              // fente -> émissif
    const bi = Math.floor(v * 4.6);
    const h = hash2(bi * 7.1, 3.3);
    let r = 74 + h * 22, g = 62 + h * 18, b = 48 + h * 14;
    const grain = Math.sin(u * 38 + h * 31) * 7 + fbm(u * 3, v * 9 + bi) * 12;
    r += grain; g += grain * 0.75; b += grain * 0.55;
    if ((u * 9) % 1 < 0.07 && board < 0.18) { r += 30; g += 30; b += 32; } // clous
    if (u < 0.05 || u > 0.95) { r = 52; g = 44; b = 36; }
    return [r, g, b];
  });

  // masque de flaques (canal rouge = profondeur d'eau)
  TEX.puddle = make((u, v) => {
    const n = fbm(u * 2.3 + 71, v * 2.3 + 18, 5);
    const k = Math.max(0, (n - 0.55) * 5.5);
    return [Math.min(1, k) * 255, 0, 0];
  });

  // plâtre fissuré, peinture qui pèle (couloir)
  TEX.plaster = make((u, v) => {
    let r = 122, g = 117, b = 108;
    const c = fbm(u * 6 + 33, v * 6 + 7);
    if (Math.abs(c - 0.5) < 0.012) return [40, 38, 36];                    // fissures
    const pn = fbm(u * 5 + 80, v * 5 + 21);
    if (pn > 0.66) { r = 141; g = 136; b = 124; }                          // cloques de peinture
    if (pn > 0.64 && pn <= 0.66) { r = 70; g = 66; b = 60; }               // bord décollé
    const m = (0.78 + 0.34 * fbm(u * 4, v * 4))
            * (1 - 0.35 * Math.max(0, (v - 0.55) / 0.45))
            * (1 - 0.2 * Math.max(0, (0.12 - v) / 0.12));
    return [r * m, g * m, b * m];
  });

  // briques suintantes (cave)
  TEX.brick = make((u, v) => {
    const row = Math.floor(v * 8);
    const uu = u + (row % 2) * 0.125;
    const fu = (uu * 4) % 1, fv = (v * 8) % 1;
    if (fv < 0.14 || fu < 0.07) return [44, 45, 48];                       // joints
    const h = hash2(Math.floor(uu * 4) + row * 7, row);
    let r = 86 + h * 34, g = 58 + h * 16, b = 52 + h * 12;
    const m = 0.8 + 0.3 * fbm(u * 9, v * 9);
    r *= m; g *= m; b *= m;
    if (v > 0.5) { const w = (v - 0.5) * 1.4; r *= 1 - w * 0.55; g *= 1 - w * 0.4; b *= 1 - w * 0.3; g += w * 9; } // suintement verdâtre
    return [r, g, b];
  });

  // porte en bois à panneaux
  TEX.woodDoor = make((u, v) => {
    let r = 98, g = 69, b = 43;
    const grain = Math.sin(v * 42 + fbm(u * 3, v * 3) * 7) * 9 + fbm(u * 2, v * 14) * 14;
    r += grain; g += grain * 0.7; b += grain * 0.5;
    const inPanel = (pa, pb) => u > 0.17 && u < 0.83 && v > pa && v < pb;
    const onBorder = (pa, pb) =>
      inPanel(pa, pb) && !(u > 0.21 && u < 0.79 && v > pa + 0.025 && v < pb - 0.025);
    if (onBorder(0.10, 0.44) || onBorder(0.56, 0.90)) { r -= 26; g -= 19; b -= 13; }
    else if (inPanel(0.10, 0.44) || inPanel(0.56, 0.90)) { r += 7; g += 5; b += 3; }
    const dk = Math.hypot(u - 0.88, v - 0.5);
    if (dk < 0.030) { const hl = dk < 0.013 ? 60 : 0; return [148 + hl, 118 + hl, 58]; } // poignée laiton
    return [r, g, b];
  });

  // miroir au cadre doré
  TEX.mirror = make((u, v) => {
    if (u < 0.08 || u > 0.92 || v < 0.05 || v > 0.95) {
      const bevel = (u < 0.04 || u > 0.96 || v < 0.025 || v > 0.975) ? -26 : 14;
      return [118 + bevel, 95 + bevel, 46 + bevel * 0.5];
    }
    let r = 56, g = 66, b = 80;
    const sheen = Math.exp(-(((u - 0.5) / 0.16) ** 2)) * 58;
    const band = Math.sin((u + v) * 19) * 5;
    const tarnish = fbm(u * 6 + 50, v * 6 + 3) > 0.68 ? -18 : 0;
    return [r + sheen + band + tarnish, g + sheen + band + tarnish, b + sheen * 1.1 + band + tarnish];
  });

  // chaudière en fonte rivetée
  TEX.furnace = make((u, v) => {
    let r = 50, g = 47, b = 45;
    const m = 0.8 + 0.35 * fbm(u * 7, v * 7);
    r *= m; g *= m; b *= m;
    if (fbm(u * 4 + 12, v * 4 + 70) > 0.68) { r = 96; g = 55; b = 30; }    // rouille
    const gx = (u * 8) % 1, gy = (v * 8) % 1;
    if (Math.hypot(gx - 0.5, gy - 0.5) < 0.13) { r += 28; g += 26; b += 24; } // rivets
    if (u > 0.25 && u < 0.75 && v > 0.45 && v < 0.88 &&
        !(u > 0.29 && u < 0.71 && v > 0.49 && v < 0.84)) { r = 30; g = 27; b = 25; } // porte du foyer
    return [r, g, b];
  });

  // parquet
  TEX.woodFloor = make((u, v) => {
    const pid = Math.floor(v * 4);
    if ((v * 4) % 1 < 0.05) return [30, 24, 18];                            // rainures
    const h = hash2(pid * 13.7, 3.1);
    let r = 96 + h * 26 - 12, g = 72 + h * 18 - 9, b = 48 + h * 12 - 6;
    const grain = Math.sin(u * 52 + h * 40 + fbm(u * 6, v * 6) * 8) * 8;
    const m = 0.82 + 0.3 * fbm(u * 3 + 40, v * 3 + 11);
    return [(r + grain) * m, (g + grain * 0.7) * m, (b + grain * 0.5) * m];
  });

  // tapis de couloir usé
  TEX.carpet = make((u, v) => {
    let r = 86, g = 35, b = 31;
    if ((v > 0.10 && v < 0.17) || (v > 0.83 && v < 0.90)) { r = 128; g = 95; b = 44; } // lisérés
    if (Math.sin(u * Math.PI * 8) * Math.sin(v * Math.PI * 8) > 0.45) { r += 11; g += 6; b += 4; }
    const m = 0.7 + 0.4 * fbm(u * 5 + 7, v * 5 + 77);
    return [r * m, g * m, b * m];
  });

  // dalles de pierre (fond de la cave, sous l'eau)
  TEX.stone = make((u, v) => {
    const fu = (u * 4) % 1, fv = (v * 4) % 1;
    if (fu < 0.06 || fv < 0.06) return [34, 36, 40];
    const h = hash2(Math.floor(u * 4) * 3.3, Math.floor(v * 4) * 7.7);
    let r = 58 + h * 20, g = 60 + h * 20, b = 66 + h * 18;
    const m = 0.8 + 0.3 * fbm(u * 8, v * 8);
    r *= m; g *= m; b *= m;
    if (fbm(u * 5 + 31, v * 5 + 13) > 0.62) g += 14;                        // algues
    return [r, g, b];
  });

  // plafond en plâtre taché
  TEX.ceiling = make((u, v) => {
    let r = 76, g = 72, b = 66;
    const m = 0.82 + 0.3 * fbm(u * 3, v * 3);
    r *= m; g *= m; b *= m;
    if (fbm(u * 2 + 9, v * 2 + 44) > 0.64) { r *= 0.72; g *= 0.66; b *= 0.58; } // auréoles
    return [r, g, b];
  });

  // solives de la cave
  TEX.ceilBasement = make((u, v) => {
    if ((v * 4) % 1 < 0.22) {
      const g = fbm(u * 10, v * 18) * 22;
      return [44 + g, 35 + g * 0.7, 27 + g * 0.5];
    }
    const m = 0.8 + 0.3 * fbm(u * 4 + 60, v * 4);
    return [46 * m, 45 * m, 44 * m];
  });
})();

const MAPTEX = {
  house:    { wall: 'wallpaper', floor: 'woodFloor', ceil: 'ceiling' },
  hall:     { wall: 'plaster',   floor: 'carpet',    ceil: 'ceiling' },
  basement: { wall: 'brick',     floor: 'stone',     ceil: 'ceilBasement' },
};

/* ---------------- entrées ---------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyF' && G.mode === 'play') G.flash = !G.flash;
  if (e.code === 'F3') { G.debug = !G.debug; e.preventDefault(); }
  if (e.code === 'KeyE') {
    if (G.mode === 'note') {
      G.note = null; G.mode = 'play'; sfx.paper();
      // Agent 03 : le joueur était hyper-concentré sur sa lecture…
      if (G.stress > 45 && G.scareCD <= 0 && Math.random() < 0.35) microScare();
    }
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
  if (t === '#' || t === 'M' || t === 'F' || t === 'B' || t === 'W') return true;
  if (t === 'd') { const d = G.doors.get(ix + ',' + iy); return !(d && d.open); }
  if (t === 'E') return true;   // la sortie se franchit via [E], jamais en marchant
  return false;
}

/* le gros mobilier bloque le passage (rayon de collision par type) */
const SOLID = {
  sofa: 0.5, armchair: 0.35, table: 0.45, bed: 0.55, wardrobe: 0.4,
  clock: 0.28, bookshelf: 0.4, counter: 0.5, stove: 0.4, bathtub: 0.55,
  sink: 0.22, toilet: 0.25, shelf: 0.4, barrel: 0.3, dresser: 0.35,
  chair: 0.22, rockchair: 0.3, coatrack: 0.2,
};
const INTERACTIVE = new Set(['note', 'album', 'key', 'fuse', 'doll', 'cradle',
                             'tv', 'fusebox', 'stairs', 'clock', 'bathtub', 'sink']);

function passableTiles(x, y) { // murs uniquement (la Mère traverse le mobilier)
  const t = tileAt(Math.floor(x), Math.floor(y));
  return !isSolid(t, Math.floor(x), Math.floor(y));
}

function passable(x, y) {
  const t = tileAt(Math.floor(x), Math.floor(y));
  if (isSolid(t, Math.floor(x), Math.floor(y))) return false;
  for (const s of G.sprites) {
    const r = SOLID[s.type];
    if (!r || s.noSolid) continue;
    const dx = x - s.x, dy = y - s.y;
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
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
  sfx.rain(name === 'house');           // l'orage ne s'entend que dans la maison
  G.thunderT = 6 + Math.random() * 14;
  bakeLights();
}

/* ---------------- lightmap statique (clair de lune, chaudière) ------
 * Cuite au chargement, avec occlusion par les murs : la lumière des
 * fenêtres dessine de vraies nappes au sol. Échantillonnée par pixel. */
let lmS = null, lmF = null, LMW = 0, LMH = 0;

function losTiles(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d * 3);
  for (let i = 1; i < steps; i++) {
    const x = ax + (bx - ax) * i / steps;
    const y = ay + (by - ay) * i / steps;
    const t = tileAt(Math.floor(x), Math.floor(y));
    if (t !== 'd' && isSolid(t, Math.floor(x), Math.floor(y))) return false;
  }
  return true;
}

function bakeLights() {
  const m = G.map;
  LMW = m.grid[0].length * 4; LMH = m.grid.length * 4;
  lmS = new Float32Array(LMW * LMH * 3);
  lmF = new Float32Array(LMW * LMH * 3);
  const lights = [...(m.lights || [])];
  if (G.mapName === 'house') {
    if (G.flags.exitOpen) lights.push({ x: 4.5, y: 1.0, r: 1.0, g: 0.95, b: 0.78, i: 1.7 });
    if (G.flags.power) lights.push({ x: 24.5, y: 12.3, r: 0.3, g: 0.9, b: 0.4, i: 0.4 });
  }
  for (const L of lights) {
    const R = 7;
    const x0 = Math.max(0, ((L.x - R) * 4) | 0), x1 = Math.min(LMW - 1, ((L.x + R) * 4) | 0);
    const y0 = Math.max(0, ((L.y - R) * 4) | 0), y1 = Math.min(LMH - 1, ((L.y + R) * 4) | 0);
    const tgt = L.fire ? lmF : lmS;
    for (let sy = y0; sy <= y1; sy++) {
      for (let sx = x0; sx <= x1; sx++) {
        const wx = (sx + 0.5) / 4, wy = (sy + 0.5) / 4;
        const d2 = (wx - L.x) ** 2 + (wy - L.y) ** 2;
        if (d2 > R * R) continue;
        if (!losTiles(L.x, L.y, wx, wy)) continue;
        const c = L.i / (1 + d2 * 1.15);
        const i3 = (sy * LMW + sx) * 3;
        tgt[i3] += c * L.r; tgt[i3 + 1] += c * L.g; tgt[i3 + 2] += c * L.b;
      }
    }
  }
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

/* rayon angulaire (interactions, stress face au mur) */
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
  addTimer(6.5, () => say('La lettre de Robert parlait d’un mot laissé dans l’entrée.', 5));
  addTimer(9, () => sfx.creak(0.4));
}

/* ---------------- interaction ---------------- */
function facingSprite() {
  let best = null, bd = 1.8;
  for (const s of G.sprites) {
    if (!INTERACTIVE.has(s.type)) continue;
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
        pickUp(s, 'Clé de la cave — récupérée. Elle était bien sur la commode.'); return;
      case 'fuse':
        pickUp(s, 'Fusible — récupéré.');
        jumpscareKitchen(); return;          // Jumpscare_03 (GDD)
      case 'doll':
        pickUp(s, 'La poupée de Lily. Gorgée d’eau depuis trois ans. Elle sourit.');
        sfx.weep(0.6); G.stress = clamp(G.stress + 8, 0, 100); return;
      case 'cradle':
        if (!G.flags.cradleDone) { jumpscareCradle(); }  // Jumpscare_02 (GDD)
        else if (!G.flags.taken_music_box) {
          G.inv.add('music_box'); G.flags.taken_music_box = true;
          sfx.pickup(); say('Boîte à musique de Lily — récupérée. Le métal est glacé.');
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
          bakeLights();
        } else { say('Le tableau électrique. Il manque un fusible — Robert parlait de la cuisine.'); failPuzzle(); }
        return;
      case 'clock':
        say('L’horloge est arrêtée à 3 h 12. La nuit de la crue, sans doute.');
        return;
      case 'bathtub':
        say('L’eau stagnante est noire. Quelque chose y a trempé longtemps.');
        G.stress = clamp(G.stress + 3, 0, 100);
        return;
      case 'sink':
        say('Dans l’éclat de miroir, votre visage met une seconde de trop à apparaître.');
        G.stress = clamp(G.stress + 4, 0, 100);
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
      } else { sfx.thud(); say('Verrouillée. C’est cette serrure que Robert n’a jamais pu se pardonner.'); failPuzzle(); }
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
        say(BURN_TEXT[carried] + ' (' + G.burned + '/3)', 5.5);
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
  addTimer(2.5, () => say('Un long hurlement s’éteint dans les murs. Puis : le silence, enfin réel.', 6));
  addTimer(6, () => say('La sortie est ouverte.', 5));
}

function endGame() {
  fadeTo(() => { G.mode = 'end'; G.ended = true; document.exitPointerLock(); });
}

/* ============================================================
 * JUMPSCARES SCRIPTÉS (GDD §3)
 * ============================================================ */
function runCut(dur, draw, onDone) {
  G.mode = 'cut';
  G.cut = { t: 0, dur, draw, onDone };
}

/* visage spectral paramétrique : jaw (mâchoire), eyes (0..1 ouverts),
 * tilt (inclinaison), smile (sourire), s = rayon du visage */
function ghostFace(c, cx, cy, s, o = {}) {
  const jaw = o.jaw || 0, eyes = o.eyes == null ? 1 : o.eyes;
  const tilt = o.tilt || 0, smile = o.smile || 0, asym = o.asym || 0;
  c.save(); c.translate(cx, cy); c.rotate(tilt);
  // peau exsangue
  let g = c.createRadialGradient(-s * 0.18, -s * 0.3, s * 0.1, 0, 0, s * 1.05);
  g.addColorStop(0, '#d9cdbd'); g.addColorStop(0.55, '#b2a493');
  g.addColorStop(0.85, '#776a5d'); g.addColorStop(1, '#443a33');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, 0, s * 0.66, s * 0.88, 0, 0, 7); c.fill();
  // joues creusées
  for (const sgn of [-1, 1]) {
    g = c.createRadialGradient(sgn * s * 0.34, s * 0.24, 0, sgn * s * 0.34, s * 0.24, s * 0.3);
    g.addColorStop(0, 'rgba(46,34,30,0.5)'); g.addColorStop(1, 'rgba(46,34,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(sgn * s * 0.34, s * 0.24, s * 0.3, s * 0.34, 0, 0, 7); c.fill();
  }
  // veines sous la peau
  c.strokeStyle = 'rgba(66,66,92,0.18)'; c.lineWidth = Math.max(1, s * 0.018);
  for (let i = -2; i <= 2; i++) {
    c.beginPath(); c.moveTo(i * s * 0.18, -s * 0.8);
    c.bezierCurveTo(i * s * 0.26, -s * 0.5, i * s * 0.14, -s * 0.3, i * s * 0.22, -s * 0.05);
    c.stroke();
  }
  // taches de moisissure sous la peau
  if (asym > 0) {
    for (let i = 0; i < 4; i++) {
      const mx = (hash(i * 7.7) - 0.5) * s * 0.9, my2 = (hash(i * 3.1) - 0.4) * s * 1.2;
      c.fillStyle = 'rgba(36,52,34,' + (0.18 * asym) + ')';
      c.beginPath(); c.ellipse(mx, my2, s * (0.06 + hash(i) * 0.08), s * (0.05 + hash(i * 2) * 0.06), hash(i * 5) * 3, 0, 7); c.fill();
    }
  }
  // orbites (asymétriques : un œil plus bas, plus grand)
  for (const sgn of [-1, 1]) {
    const ery = s * 0.22 * Math.max(eyes, 0.18) * (sgn < 0 ? 1 + asym * 0.5 : 1);
    const oy = -s * 0.16 + (sgn < 0 ? asym * s * 0.08 : 0);
    const orx = s * 0.19 * (sgn < 0 ? 1 + asym * 0.25 : 1);
    g = c.createRadialGradient(sgn * s * 0.27, oy, 0, sgn * s * 0.27, oy, s * 0.24);
    g.addColorStop(0, '#000'); g.addColorStop(0.75, 'rgba(8,4,6,0.95)'); g.addColorStop(1, 'rgba(8,4,6,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(sgn * s * 0.27, oy, orx, ery + s * 0.04, sgn * asym * 0.2, 0, 7); c.fill();
    if (eyes > 0.3) { // reflet humide
      c.fillStyle = 'rgba(220,225,235,' + (0.55 * eyes) + ')';
      c.beginPath(); c.ellipse(sgn * s * 0.23, oy - s * 0.03, s * 0.025, s * 0.035, 0, 0, 7); c.fill();
    }
  }
  // ombre du nez
  c.fillStyle = 'rgba(40,30,28,0.4)';
  c.beginPath(); c.moveTo(0, -s * 0.05); c.lineTo(-s * 0.07, s * 0.22); c.lineTo(s * 0.05, s * 0.22); c.fill();
  // bouche
  const mw = s * (0.16 + jaw * 0.13 + smile * 0.12);
  const mh = s * (0.045 + jaw * 0.55);
  const my = s * 0.44 + mh * 0.4;
  g = c.createRadialGradient(0, my, 0, 0, my, Math.max(mw, mh));
  g.addColorStop(0, '#000'); g.addColorStop(1, '#1c0d0c');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, my, mw, mh, 0, 0, 7); c.fill();
  if (smile > 0) { // commissures étirées
    c.strokeStyle = 'rgba(20,8,8,0.8)'; c.lineWidth = s * 0.025;
    c.beginPath(); c.moveTo(-mw, my); c.quadraticCurveTo(-mw * 1.3, my - s * 0.06 * smile, -mw * 1.5, my - s * 0.1 * smile); c.stroke();
    c.beginPath(); c.moveTo(mw, my); c.quadraticCurveTo(mw * 1.3, my - s * 0.06 * smile, mw * 1.5, my - s * 0.1 * smile); c.stroke();
  }
  if (jaw > 0.22) { // dents irrégulières
    c.fillStyle = 'rgba(208,198,178,0.9)';
    for (let i = -3; i <= 3; i++) {
      const tx = i * mw * 0.24, th = mh * (0.22 + hash(i * 9.7) * 0.2);
      c.beginPath(); c.moveTo(tx - mw * 0.08, my - mh * 0.85);
      c.lineTo(tx + mw * 0.08, my - mh * 0.85); c.lineTo(tx, my - mh * 0.85 + th); c.fill();
    }
  }
  if (jaw > 0.6) { // tendons étirés sous la mâchoire décrochée
    c.strokeStyle = 'rgba(150,128,116,0.55)'; c.lineWidth = s * 0.022;
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(i * mw * 0.3, my - mh * 0.8);
      c.lineTo(i * mw * 0.38, my + mh * 0.72); c.stroke();
    }
  }
  // mèches de cheveux trempées
  c.strokeStyle = 'rgba(10,8,9,0.92)'; c.lineWidth = s * 0.05;
  for (let i = -4; i <= 4; i++) {
    c.beginPath(); c.moveTo(i * s * 0.13, -s * 0.84);
    c.bezierCurveTo(i * s * 0.2, -s * 0.3, i * s * 0.16, s * 0.1, i * s * 0.19, s * 0.62);
    c.stroke();
  }
  c.restore();
}

/* Jumpscare_01 : « Le Reflet du Miroir » */
function jumpscareMirror() {
  G.flags.j1 = true;
  G.stress = clamp(G.stress + 15, 0, 100);
  sfx.dreadSwell(1.5);
  addTimer(0.18, () => sfx.footstep(0.10));
  addTimer(0.42, () => sfx.footstep(0.10));
  addTimer(0.66, () => sfx.footstep(0.10));
  addTimer(0.55, () => sfx.heartbeat());
  addTimer(1.15, () => sfx.heartbeat());
  addTimer(1.48, () => sfx.blackout(0.44));    // silence absolu avant le choc (Agent 02)
  addTimer(1.92, () => { sfx.scream(true, 0.8); sfx.shriek(0.45); }); // cri binaural DERRIÈRE le joueur
  addTimer(2.62, () => sfx.glassCrack());
  runCut(3.6, (t, c) => {
    const cx = W / 2, cy = H / 2;
    // pénombre du couloir
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07060a'); g.addColorStop(0.55, '#100d10'); g.addColorStop(1, '#060507');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // cadre doré ouvragé
    g = c.createLinearGradient(cx - 160, 0, cx + 160, 0);
    g.addColorStop(0, '#5a4716'); g.addColorStop(0.5, '#a8862f'); g.addColorStop(1, '#4c3b12');
    c.fillStyle = g; c.fillRect(cx - 158, cy - 212, 316, 424);
    c.fillStyle = '#241c08'; c.fillRect(cx - 142, cy - 196, 284, 392);
    for (const [ox, oy] of [[-158, -212], [142, -212], [-158, 196], [142, 196]]) {
      c.fillStyle = '#b6953d';
      c.beginPath(); c.arc(cx + ox + 8, cy + oy + 8, 10, 0, 7); c.fill();
    }
    // verre
    g = c.createLinearGradient(cx - 140, 0, cx + 140, 0);
    g.addColorStop(0, '#2b333d'); g.addColorStop(0.5, '#46525e'); g.addColorStop(1, '#28303a');
    c.fillStyle = g; c.fillRect(cx - 140, cy - 194, 280, 388);
    g = c.createRadialGradient(cx - 40, cy - 80, 10, cx, cy, 260);
    g.addColorStop(0, 'rgba(150,165,180,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(cx - 140, cy - 194, 280, 388);

    // …et loin DERRIÈRE vous, dans le reflet, quelqu'un se tient debout
    if (t > 0.35 && t < 1.28) {
      const fade = clamp((t - 0.35) / 0.3, 0, 1) * clamp((1.28 - t) / 0.12, 0, 1);
      c.save();
      c.beginPath(); c.rect(cx - 140, cy - 194, 280, 388); c.clip();
      c.globalAlpha = 0.6 * fade;
      c.fillStyle = '#060508';
      c.beginPath(); c.moveTo(cx + 48, cy + 96); c.lineTo(cx + 74, cy + 96);
      c.lineTo(cx + 68, cy + 18); c.lineTo(cx + 54, cy + 18); c.fill();
      c.beginPath(); c.ellipse(cx + 61, cy + 10, 8, 10, 0, 0, 7); c.fill();
      c.globalAlpha = 1; c.restore();
    }

    // LE REFLET : il marche, s'arrête, penche la tête, se retourne…
    const walkBob = t < 0.7 ? Math.sin(t * 18) * 4 : 0;
    const tilt = clamp((t - 0.9) / 0.4, 0, 1) * 0.32;
    const turn = clamp((t - 1.3) / 0.6, 0, 1);
    const sxw = Math.cos(turn * Math.PI);
    c.save();
    c.beginPath(); c.rect(cx - 140, cy - 194, 280, 388); c.clip();
    c.translate(cx, cy + 150 + walkBob);
    // corps
    c.save(); c.scale(Math.max(Math.abs(sxw), 0.16), 1);
    g = c.createLinearGradient(0, -210, 0, 0);
    g.addColorStop(0, '#16141a'); g.addColorStop(1, '#060507');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-40, 0); c.lineTo(40, 0);
    c.bezierCurveTo(30, -120, 26, -180, 18, -206);
    c.lineTo(-18, -206); c.bezierCurveTo(-26, -180, -30, -120, -40, 0); c.fill();
    c.restore();
    // tête
    c.save(); c.translate(0, -228); c.rotate(tilt * (1 - turn));
    if (turn > 0.55) {
      ghostFace(c, 0, 0, 26, { smile: clamp((t - 1.6) / 0.3, 0, 1), eyes: 1, jaw: 0.05, asym: 0.35 });
    } else {
      c.save(); c.scale(Math.max(Math.abs(sxw), 0.16), 1);
      c.fillStyle = '#0b0a0d';
      c.beginPath(); c.ellipse(0, 0, 19, 25, 0, 0, 7); c.fill();
      c.restore();
    }
    c.restore();
    // l'entaille et le sang sur le verre
    const cut = clamp((t - 1.95) / 0.45, 0, 1);
    if (cut > 0) {
      c.strokeStyle = '#8e0009'; c.lineWidth = 3 + cut * 4;
      c.beginPath(); c.moveTo(-18 * cut, -206); c.lineTo(18 * cut, -203); c.stroke();
      for (let i = 0; i < 6; i++) {
        const bx = -15 + i * 6, sp = 0.6 + hash(i * 3.1) * 0.9;
        const blen = clamp((t - 2.0) * sp, 0, 1) * (220 + hash(i * 7.7) * 120);
        g = c.createLinearGradient(0, -202, 0, -202 + blen);
        g.addColorStop(0, 'rgba(140,0,10,0.95)'); g.addColorStop(1, 'rgba(70,0,6,0.55)');
        c.fillStyle = g;
        c.fillRect(bx, -202, 3.5 - i % 2, blen);
      }
    }
    c.restore();
    // le verre se fissure
    const crack = clamp((t - 2.6) / 0.25, 0, 1);
    if (crack > 0) {
      c.strokeStyle = 'rgba(225,235,245,' + (0.5 * crack) + ')'; c.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + hash(i * 5.3);
        c.beginPath(); c.moveTo(cx, cy - 56);
        let lx = cx, ly = cy - 56;
        for (let s2 = 0; s2 < 4; s2++) {
          lx += Math.cos(a + hash(i + s2 * 13) * 0.7 - 0.35) * 42 * crack;
          ly += Math.sin(a + hash(i * 7 + s2) * 0.7 - 0.35) * 42 * crack;
          c.lineTo(lx, ly);
        }
        c.stroke();
      }
    }
    // strobe final puis noir
    if (t > 2.95 && t < 3.18 && ((t * 22) | 0) % 2 === 0) {
      c.fillStyle = 'rgba(235,238,245,0.32)'; c.fillRect(0, 0, W, H);
    }
    if (t > 3.15) { c.fillStyle = 'rgba(0,0,0,' + clamp((t - 3.15) / 0.4, 0, 1) + ')'; c.fillRect(0, 0, W, H); }
  }, () => {
    G.fx.glitchT = 0.4; G.fx.shake = 0.8;
    say('Le reflet a souri avant de tomber. Pas vous.', 5);
  });
}

/* Jumpscare_02 : « Le Berceau » */
function jumpscareCradle() {
  G.flags.cradleDone = true;
  G.stress = clamp(G.stress + 15, 0, 100);
  sfx.plink();
  addTimer(0.07, () => sfx.blackout(0.27));    // silence absolu avant le choc (Agent 02)
  addTimer(0.35, () => { sfx.stinger(); sfx.glitchBlast(); sfx.scream(false, 0.65); sfx.shriek(0.6); });
  runCut(1.9, (t, c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    if (t < 0.35) {
      // on se penche : l'intérieur du berceau, un lange qui bouge
      let g = c.createRadialGradient(cx, cy + 30, 40, cx, cy + 30, 330);
      g.addColorStop(0, '#262024'); g.addColorStop(1, '#000');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(cx, cy + 30, 320, 200, 0, 0, 7); c.fill();
      const tw = t > 0.24 ? Math.sin(t * 90) * 7 : 0;   // ça remue
      c.save(); c.translate(cx + tw, cy + 55); c.rotate(tw * 0.012);
      g = c.createLinearGradient(0, -60, 0, 60);
      g.addColorStop(0, '#57505a'); g.addColorStop(1, '#1c181d');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(0, 0, 120, 64, 0.08, 0, 7); c.fill();
      c.strokeStyle = 'rgba(15,12,16,0.7)'; c.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(-100 + i * 18, -36 + i * 9);
        c.quadraticCurveTo(0, -10 + i * 14, 96 - i * 12, -28 + i * 13); c.stroke();
      }
      c.restore();
    } else if (t < 0.9) {
      // l'entité difforme jaillit vers la caméra (gel d'images : 60 FPS -> 0)
      const k = clamp((gT(t) - 0.35) / 0.42, 0, 1);
      const s = 18 + k * k * 470;
      const jx = (Math.random() - 0.5) * 16 * k, jy = (Math.random() - 0.5) * 12 * k;
      for (let i = 3; i >= 1; i--) {  // images rémanentes
        c.globalAlpha = 0.14;
        ghostFace(c, cx + jx * i * 0.6, cy + 26 + jy * i * 0.6 - k * 36, s * (1 - i * 0.13),
                  { jaw: k * 1.1, eyes: 1, tilt: (i - 2) * 0.06, asym: 0.7 });
      }
      c.globalAlpha = 1;
      ghostFace(c, cx + jx, cy + 26 - k * 36, s, { jaw: k * 1.15, eyes: 1, asym: 0.7 });
    }
    // 0,5 s de statique visuelle (GDD)
    if (t > 0.85 && t < 1.35) {
      for (let i = 0; i < 900; i++) {
        const v = (Math.random() * 225) | 0;
        c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        c.fillRect(Math.random() * W, Math.random() * H, 5, 3);
      }
      for (let i = 0; i < 5; i++) {
        const y = Math.random() * H;
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.fillRect(0, y, W, 2);
      }
    }
    if (t >= 1.35) {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.globalAlpha = Math.max(0, 0.10 - (t - 1.35) * 0.2);
      ghostFace(c, cx, cy, 280, { jaw: 1.1 });
      c.globalAlpha = 1;
    }
  }, () => {
    say('Le berceau est vide. Au fond : la boîte à musique de Lily.', 5);
  });
}

/* Jumpscare_03 : « Effondrement de la Cuisine » */
function jumpscareKitchen() {
  G.flags.j3 = true;
  sfx.blackout(2.0);                     // silence absolu de 2 s (GDD)
  addTimer(2.0, () => {
    for (let i = 0; i < 8; i++) {        // placards et tiroirs qui claquent en même temps
      sfx.slam((Math.random() - 0.5) * 1.7, 0.42);
    }
    sfx.glassSmash(0.08);                // assiettes au sol
    sfx.ropeCreak();
    addTimer(0.24, () => sfx.neckSnap());
    addTimer(1.5, () => { sfx.stinger(); sfx.subDrop(0.5); sfx.shriek(0.55); });
    G.stress = clamp(G.stress + 20, 0, 100);
    G.fx.shake = 1.2; G.fx.flickerT = 1.6;
    runCut(2.1, (t, c) => {
      const cx = W / 2;
      // cuisine plongée dans le noir, placards béants suggérés
      c.fillStyle = 'rgba(2,2,3,0.78)'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(46,38,30,0.5)';
      for (let i = 0; i < 6; i++) {
        const bx = 60 + i * 150, open = clamp(t * 6 - i * 0.1, 0, 1);
        c.save(); c.translate(bx, 90); c.transform(1, 0.18 * open, 0, 1, 0, 0);
        c.fillRect(0, 0, 70, 90); c.restore();
      }
      // éclats d'assiettes qui retombent
      if (t < 0.7) {
        c.fillStyle = 'rgba(216,212,200,0.8)';
        for (let i = 0; i < 14; i++) {
          const fx2 = hash(i * 3.3) * W;
          const fy2 = H * 0.45 + (t * (2.2 + hash(i * 7.1) * 2)) ** 2 * 300;
          if (fy2 < H) {
            c.save(); c.translate(fx2, fy2); c.rotate(t * 9 + i);
            c.fillRect(-6, -2, 12, 4); c.restore();
          }
        }
      }
      // LE PENDU tombe du plafond face caméra
      const drop = clamp(t / 0.22, 0, 1);
      const settle = t > 0.22 ? Math.exp(-(t - 0.22) * 5) * Math.sin((t - 0.22) * 26) * 16 : 0;
      const sway = Math.sin(t * 7.5) * Math.max(0, 1 - t / 2.1) * 18;
      const by = -430 + drop * 470 + settle;
      // images rémanentes pendant la chute
      const ghosts = drop < 1 ? 3 : 0;
      for (let gi = ghosts; gi >= 0; gi--) {
        const gy = by - gi * 46 * (1 - drop);
        c.globalAlpha = gi === 0 ? 1 : 0.16;
        c.save(); c.translate(cx + sway, gy);
        // corde
        c.strokeStyle = '#584730'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(0, -300); c.lineTo(0, -2); c.stroke();
        c.strokeStyle = 'rgba(20,16,10,0.6)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-2, -300); c.lineTo(-2, -2); c.stroke();
        // tête (penchée, puis qui SE REDRESSE vers vous)
        const lift = clamp((t - 1.2) / 0.35, 0, 1);
        const headTilt = 0.5 * (1 - lift);
        const eyesO = clamp((t - 1.35) / 0.2, 0, 1);
        const lunge = clamp((t - 1.55) / 0.18, 0, 1);
        c.save(); c.translate(0, 36 + lunge * 60); c.scale(1 + lunge * 2.6, 1 + lunge * 2.6);
        ghostFace(c, 0, 0, 30, { tilt: headTilt, eyes: eyesO, jaw: lunge * 0.8 });
        c.restore();
        // corps
        let g = c.createLinearGradient(0, 70, 0, 320);
        g.addColorStop(0, '#1b1716'); g.addColorStop(1, '#080606');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(-34, 74); c.lineTo(34, 74);
        c.lineTo(24, 320); c.lineTo(-24, 320); c.fill();
        // bras ballants
        c.strokeStyle = '#121010'; c.lineWidth = 13; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-30, 88); c.quadraticCurveTo(-46 - sway * 0.4, 190, -38 - sway * 0.7, 286); c.stroke();
        c.beginPath(); c.moveTo(30, 88); c.quadraticCurveTo(48 - sway * 0.4, 190, 40 - sway * 0.7, 286); c.stroke();
        c.restore();
      }
      c.globalAlpha = 1;
      // il disparaît dans le noir, instantanément
      if (t > 1.72) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    }, () => {
      say('Tous les placards sont béants. Et ce visage, une demi-seconde… Robert ?', 5.5);
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
    [evWeep, evMimic, evShadow, evRocking],                          // intensité moyenne
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

function evRocking() { // le rocking-chair de la chambre d'enfant se balance seul
  if (G.mapName !== 'house') { evWeep(); return; }
  G.rockT = 6;
  for (let i = 0; i < 4; i++) addTimer(i * 1.1, () => sfx.creak(0.45));
}

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
    if (passableTiles(nx, m.y)) m.x = nx;
    if (passableTiles(m.x, ny)) m.y = ny;
  }
  m.stepT -= dt * sp; if (m.stepT <= 0) { m.stepT = 0.55; sfx.motherStep(d); }
  m.breathT -= dt; if (m.breathT <= 0) { m.breathT = 2.4; sfx.breathing(d); }
  if (sees) G.stress = clamp(G.stress + 7 * dt, 0, 100);
  if (d < 0.78) caught();
}

function caught() {
  sfx.scream(false, 0.9);
  sfx.subDrop(0.7);
  sfx.shriek(0.7);
  G.stress = 100;
  runCut(1.8, (t, c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    // des mains agrippent les bords de l'écran
    const grip = clamp(t / 0.16, 0, 1);
    c.fillStyle = '#0a0708';
    for (const sgn of [-1, 1]) {
      c.save(); c.translate(sgn > 0 ? W : 0, cy);
      for (let f = 0; f < 4; f++) {
        const fl = (90 + f * 14) * grip;
        c.save(); c.rotate(sgn * (-0.28 + f * 0.17));
        c.beginPath();
        if (c.roundRect) c.roundRect(sgn > 0 ? -fl : 0, -16, fl, 30, 14);
        else c.rect(sgn > 0 ? -fl : 0, -16, fl, 30);
        c.fill(); c.restore();
      }
      c.restore();
    }
    // le visage de la Mère engloutit l'écran, mâchoire décrochée (gel d'images)
    const k = clamp((gT(t) - 0.12) / 0.42, 0, 1);
    const s = 36 + k * k * 460;
    const jx = (Math.random() - 0.5) * 14 * k, jy = (Math.random() - 0.5) * 10 * k;
    ghostFace(c, cx + jx, cy + jy, s, { jaw: clamp(k * 1.4, 0, 1.3), eyes: 1 - k * 0.5, asym: 0.55 });
    // morsure : le noir se referme verticalement
    const bite = clamp((t - 0.95) / 0.18, 0, 1);
    if (bite > 0) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H / 2 * bite);
      c.fillRect(0, H - H / 2 * bite, W, H / 2 * bite);
    }
    if (t > 1.15) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
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
  for (let i = G.timers.length - 1; i >= 0; i--) {
    G.timers[i].t -= dt;
    if (G.timers[i].t <= 0) { const fn = G.timers[i].fn; G.timers.splice(i, 1); fn(); }
  }

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
  if (G.scareCD > 0) G.scareCD -= dt;
  if (G.appar) { G.appar.t -= dt; if (G.appar.t <= 0) G.appar = null; }
  if (G.rockT > 0) G.rockT -= dt;
  G.lightning = Math.max(0, G.lightning - dt * 2.1);
  // orage : éclair par les volets, tonnerre décalé
  if (G.mapName === 'house' && G.mode === 'play') {
    G.thunderT -= dt;
    if (G.thunderT <= 0) {
      G.thunderT = 16 + Math.random() * 30;
      G.lightning = 1;
      const far = 1 + Math.random() * 1.6;
      addTimer(0.7 + Math.random() * 1.6, () => sfx.thunder(far));
    }
  }

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

  // Agent 03 : virage caméra brusque = fenêtre de vulnérabilité
  let dA = p.a - G.lastA;
  dA = Math.atan2(Math.sin(dA), Math.cos(dA));
  const angVel = Math.abs(dA) / Math.max(dt, 0.001);
  G.lastA = p.a;
  if (angVel > 4.2 && G.stress >= 40 && G.scareCD <= 0 && Math.random() < 0.3) {
    microScare();
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

  if (G.stress > 55) {
    G.heartT -= dt * (0.7 + G.stress / 80);
    if (G.heartT <= 0) { G.heartT = 1; sfx.heartbeat(); }
  }

  scheduleEvents(dt);

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
          sfx.weep(0.4); say('Les murs sont plus proches qu’avant. Et cette chaise n’y était pas.');
          G.shadow = { x: 22, y: 2.5, vx: 0, vy: 0, t: 2.2 };
          G.sprites.push({ type: 'chair', id: 'hchair', x: 12.3, y: 2.35, noSolid: true });
        }
        if (G.loops === 3) {
          sfx.sigh(0, 1.3); sfx.slam(0, 0.5); say('Il n’y a presque plus de place. Continuez.');
          G.sprites = G.sprites.filter(s => s.id !== 'hchair');
          G.sprites.push({ type: 'chairFallen', id: 'hchair2', x: 8.2, y: 2.6, noSolid: true });
        }
        G.stress = clamp(G.stress + 8, 0, 100);
      } else {
        fadeTo(() => {
          G.loops = 0;
          loadMap('basement');
          say('La cave. L’eau noire monte. Quelque chose chantonne en berçant le vide.', 6);
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
      clock: '[E] Horloge', bathtub: '[E] Baignoire', sink: '[E] Lavabo',
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

/* ============================================================
 * RENDU
 * ============================================================ */
const colAng = new Float32Array(RW);
for (let i = 0; i < RW; i++) colAng[i] = Math.atan((2 * i / RW - 1) * TANF);
const beamCol = new Float32Array(RW);

// poussière en suspension dans le faisceau (GDD §1 : micro-dust)
const motes = [];
for (let i = 0; i < 60; i++) {
  motes.push({ x: Math.random(), y: Math.random(), s: 1 + Math.random() * 1.6,
               vy: 0.004 + Math.random() * 0.012, ph: Math.random() * 9 });
}

// canvases de grain pré-générés
const grain = [];
for (let i = 0; i < 4; i++) {
  const cnv = document.createElement('canvas');
  cnv.width = 160; cnv.height = 90;
  const c2 = cnv.getContext('2d');
  const im = c2.createImageData(160, 90);
  for (let j = 0; j < im.data.length; j += 4) {
    const v = Math.random() * 255;
    im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255;
  }
  c2.putImageData(im, 0, 0);
  grain.push(cnv);
}

function render(time) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (G.mode === 'title') { drawTitle(time); return; }
  if (G.mode === 'end') { drawEnd(time); return; }

  const p = G.player;
  const t = time * 0.001;
  const amb = G.map.ambient * (G.flags.power && G.mapName === 'house' ? 1.5 : 1)
            * G.fx.lightMul * (G.mapName === 'hall' ? Math.max(0.35, 1 - G.loops * 0.22) : 1);
  const K = 3.3;
  const dirX = Math.cos(p.a), dirY = Math.sin(p.a);
  const plX = -dirY * TANF, plY = dirX * TANF;
  const r0x = dirX - plX, r0y = dirY - plY;
  const r1x = dirX + plX, r1y = dirY + plY;
  const bob = Math.sin(G.stepAcc * 9) * 1.2;
  const horizon = (RH / 2 + bob) | 0;
  const tset = MAPTEX[G.mapName];
  const wallTexDef = TEX[tset.wall], floorTex = TEX[tset.floor], ceilTex = TEX[tset.ceil];
  const water = G.map.water;
  const exitOpen = !!G.flags.exitOpen;
  const glowF = 0.6 + Math.random() * 0.4;   // braises de la chaudière
  const moonM = 1 + G.lightning * 2.4;       // l'éclair sur-expose le clair de lune
  const fireM = glowF;
  const puddles = G.mapName === 'house';
  const PUD = TEX.puddle;

  for (let i = 0; i < RW; i++) {
    const a2 = colAng[i] / 0.5;
    beamCol[i] = G.flash ? Math.max(0, 1 - a2 * a2) * 1.15 : 0;
  }

  /* ---- plafond (projection par scanline) ---- */
  for (let y = 0; y < horizon; y++) {
    const pq = horizon - y;
    const rd = CAMZ / pq;
    const att = 1 / (1 + rd * rd * 0.06);
    let fx = p.x + rd * r0x, fy = p.y + rd * r0y;
    const stx = rd * (r1x - r0x) / RW, sty = rd * (r1y - r0y) / RW;
    let o = y * RW;
    for (let x = 0; x < RW; x++, o++, fx += stx, fy += sty) {
      const l = (amb + beamCol[x] * att) * att * K * 0.8;
      let lx4 = (fx * 4) | 0; lx4 = lx4 < 0 ? 0 : lx4 >= LMW ? LMW - 1 : lx4;
      let ly4 = (fy * 4) | 0; ly4 = ly4 < 0 ? 0 : ly4 >= LMH ? LMH - 1 : ly4;
      const i3 = (ly4 * LMW + lx4) * 3;
      const Lr = l + (lmS[i3] * moonM + lmF[i3] * fireM) * 0.6;
      const Lg = l + (lmS[i3 + 1] * moonM + lmF[i3 + 1] * fireM) * 0.6;
      const Lb = l + (lmS[i3 + 2] * moonM + lmF[i3 + 2] * fireM) * 0.6;
      const c = ceilTex[((((fy * 64) | 0) & 63) << 6) + (((fx * 64) | 0) & 63)];
      let r = (c & 255) * Lr, g = ((c >> 8) & 255) * Lg, b = ((c >> 16) & 255) * Lb;
      px32[o] = 0xFF000000 | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
    }
  }

  /* ---- sol (parquet / tapis / eau noire animée) ---- */
  for (let y = horizon; y < RH; y++) {
    const pq = y - horizon + 1;
    const rd = CAMZ / pq;
    const att = 1 / (1 + rd * rd * 0.06);
    let fx = p.x + rd * r0x, fy = p.y + rd * r0y;
    const stx = rd * (r1x - r0x) / RW, sty = rd * (r1y - r0y) / RW;
    let o = y * RW;
    if (water) {
      for (let x = 0; x < RW; x++, o++, fx += stx, fy += sty) {
        const l = (amb + beamCol[x] * att) * att * K;
        let lx4 = (fx * 4) | 0; lx4 = lx4 < 0 ? 0 : lx4 >= LMW ? LMW - 1 : lx4;
        let ly4 = (fy * 4) | 0; ly4 = ly4 < 0 ? 0 : ly4 >= LMH ? LMH - 1 : ly4;
        const i3 = (ly4 * LMW + lx4) * 3;
        const sr = lmS[i3] * moonM + lmF[i3] * fireM;
        const sg = lmS[i3 + 1] * moonM + lmF[i3 + 1] * fireM;
        const sb = lmS[i3 + 2] * moonM + lmF[i3 + 2] * fireM;
        const wx = fx + sinT(fy * 7 + t * 2.2) * 0.05;
        const wy = fy + sinT(fx * 6.3 - t * 1.9) * 0.05;
        const c = floorTex[((((wy * 64) | 0) & 63) << 6) + (((wx * 64) | 0) & 63)];
        let r = (c & 255) * (l + sr) * 0.30 + sr * 60;
        let g = ((c >> 8) & 255) * (l + sg) * 0.46 + 10 * l + sg * 55;
        let b = ((c >> 16) & 255) * (l + sb) * 0.58 + 20 * l + sb * 38;
        const sp = sinT(fx * 5.1 + t * 3.1) * sinT(fy * 4.3 - t * 2.6);
        if (sp > 0.86) { const e = (sp - 0.86) * (800 * att + sr * 2200); r += e; g += e * 1.05; b += e * 1.2; }
        px32[o] = 0xFF000000 | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
      }
    } else {
      for (let x = 0; x < RW; x++, o++, fx += stx, fy += sty) {
        const l = (amb + beamCol[x] * att) * att * K;
        let lx4 = (fx * 4) | 0; lx4 = lx4 < 0 ? 0 : lx4 >= LMW ? LMW - 1 : lx4;
        let ly4 = (fy * 4) | 0; ly4 = ly4 < 0 ? 0 : ly4 >= LMH ? LMH - 1 : ly4;
        const i3 = (ly4 * LMW + lx4) * 3;
        const sr = lmS[i3] * moonM + lmF[i3] * fireM;
        const sg = lmS[i3 + 1] * moonM + lmF[i3 + 1] * fireM;
        const sb = lmS[i3 + 2] * moonM + lmF[i3 + 2] * fireM;
        const c = floorTex[((((fy * 64) | 0) & 63) << 6) + (((fx * 64) | 0) & 63)];
        let r = (c & 255) * (l + sr), g = ((c >> 8) & 255) * (l + sg), b = ((c >> 16) & 255) * (l + sb);
        if (puddles) {
          // flaques sur le parquet : reflets du clair de lune et de la lampe
          const pm = (PUD[((((fy * 16) | 0) & 63) << 6) + (((fx * 16) | 0) & 63)] & 255) / 255;
          if (pm > 0.05) {
            const spec = beamCol[x] * att * 175;
            const rr = 13 + sr * 235 + spec, rg = 15 + sg * 235 + spec, rb = 21 + sb * 235 + spec * 1.12;
            const k = pm * 0.82;
            r = r * (1 - k) + rr * k; g = g * (1 - k) + rg * k; b = b * (1 - k) + rb * k;
          }
        }
        px32[o] = 0xFF000000 | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
      }
    }
  }

  /* ---- murs (DDA texturé par colonne) ---- */
  for (let col = 0; col < RW; col++) {
    const cam = 2 * col / RW - 1;
    const rdx = dirX + plX * cam, rdy = dirY + plY * cam;
    let ix = Math.floor(p.x), iy = Math.floor(p.y);
    const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
    let sx, sy, sdx, sdy;
    if (rdx < 0) { sx = -1; sdx = (p.x - ix) * ddx; } else { sx = 1; sdx = (ix + 1 - p.x) * ddx; }
    if (rdy < 0) { sy = -1; sdy = (p.y - iy) * ddy; } else { sy = 1; sdy = (iy + 1 - p.y) * ddy; }
    let side = 0, tile = '#', perp = 40;
    for (let s2 = 0; s2 < 64; s2++) {
      if (sdx < sdy) { sdx += ddx; ix += sx; side = 0; } else { sdy += ddy; iy += sy; side = 1; }
      const tt = tileAt(ix, iy);
      if (isSolid(tt, ix, iy)) { tile = tt; perp = side === 0 ? sdx - ddx : sdy - ddy; break; }
    }
    perp = Math.max(perp, 0.02);
    G.zbuf[col] = perp;
    let texX = side === 0 ? p.y + perp * rdy : p.x + perp * rdx;
    texX -= Math.floor(texX);
    const lineH = RH / perp;
    const top = horizon - lineH / 2;
    const att = 1 / (1 + perp * perp * 0.06);
    let l = (amb + beamCol[col] * att) * att * K;
    if (side === 1) l *= 0.8;
    l *= 0.88 + 0.24 * hash(ix * 127.1 + iy * 311.7);
    // lumière cuite au point d'impact (côté joueur du mur)
    const hx = p.x + perp * rdx * 0.94, hy = p.y + perp * rdy * 0.94;
    let lx4 = (hx * 4) | 0; lx4 = lx4 < 0 ? 0 : lx4 >= LMW ? LMW - 1 : lx4;
    let ly4 = (hy * 4) | 0; ly4 = ly4 < 0 ? 0 : ly4 >= LMH ? LMH - 1 : ly4;
    const li3 = (ly4 * LMW + lx4) * 3;
    const wlr = lmS[li3] * moonM + lmF[li3] * fireM;
    const wlg = lmS[li3 + 1] * moonM + lmF[li3 + 1] * fireM;
    const wlb = lmS[li3 + 2] * moonM + lmF[li3 + 2] * fireM;
    let tex = wallTexDef;
    if (G.mapName === 'house' && tile === '#') {
      // le délabrement varie d'un pan de mur à l'autre
      const hv = hash(ix * 31.7 + iy * 17.3);
      tex = hv < 0.48 ? TEX.wallpaper : hv < 0.78 ? TEX.wallpaper2 : TEX.wallpaper3;
    }
    if (tile === 'd' || tile === 'E') tex = TEX.woodDoor;
    else if (tile === 'B') { tex = TEX.woodDoor; l *= 0.7; }
    else if (tile === 'M') { tex = TEX.mirror; l *= 1.12; }
    else if (tile === 'F') tex = TEX.furnace;
    else if (tile === 'W') tex = TEX.window;
    // murs qui saignent (palier haut)
    let bA = 0;
    if (G.fx.blood > 0 && tile !== 'M') {
      bA = G.fx.blood * (hash(ix * 7.3 + iy * 13.7 + ((texX * 8) | 0) * 3.3) > 0.55 ? 0.8 : 0.15);
    }
    const Mr = (1 - bA) * l + wlr, Mg = (1 - bA) * l + wlg, Mb = (1 - bA) * l + wlb;
    const rA = 150 * bA * l, gA2 = 9 * bA * l, bA2 = 11 * bA * l;
    const tu = ((texX * 64) | 0) & 63;
    const stepT = 64 / lineH;
    let ys = top | 0, ye = (top + lineH) | 0;
    let tv = 0;
    if (ys < 0) { tv = -top * stepT; ys = 0; }
    if (ye > RH - 1) ye = RH - 1;
    let o = ys * RW + col;
    const isF = tile === 'F';
    const isW2 = tile === 'W';
    const isEo = tile === 'E' && exitOpen;
    const moonE = (0.5 + G.lightning * 1.6) * (0.45 + att * 0.75);
    for (let y = ys; y <= ye; y++, o += RW, tv += stepT) {
      const c = tex[(((tv | 0) & 63) << 6) + tu];
      let r = (c & 255) * Mr + rA, g = ((c >> 8) & 255) * Mg + gA2, b = ((c >> 16) & 255) * Mb + bA2;
      if (isW2 && (c & 255) > 200) { // fente entre les planches : clair de lune émissif
        r = 185 * moonE; g = 200 * moonE; b = 255 * moonE;
      }
      if (isF && tv > 33) { const e = (tv - 33) * 2.4 * glowF * att; r += e * 3.1; g += e * 1.2; b += e * 0.2; }
      if (isEo && tu > 8 && tu < 56) { const m2 = 0.65 * att; r = r * (1 - m2) + 225 * m2; g = g * (1 - m2) + 222 * m2; b = b * (1 - m2) + 200 * m2; }
      px32[o] = 0xFF000000 | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
    }
  }

  wctx.putImageData(wimg, 0, 0);

  const shx = (Math.random() - 0.5) * G.fx.shake * 14;
  const shy = (Math.random() - 0.5) * G.fx.shake * 11;
  ctx.save(); ctx.translate(shx, shy);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(world, 0, 0, W, H);
  drawSprites(amb, bob * 2, time);
  drawDust(time);
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
  const plX = -dirY * TANF, plY = dirX * TANF;
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
      const ci = clamp((sx / W * RW) | 0, 0, RW - 1);
      if (G.zbuf[ci] < ty - 0.25) return;          // occlusion
      const size = H / ty;
      const floorY = H / 2 + size / 2 + bob;
      const att = 1 / (1 + ty * ty * 0.06);
      const beam = G.flash ? Math.max(0, 1 - ((sx - W / 2) / (W / 2) * TANF / 0.5) ** 2) * 1.15 : 0;
      // lumière cuite à la position du sprite
      let lx4 = (s.x * 4) | 0; lx4 = lx4 < 0 ? 0 : lx4 >= LMW ? LMW - 1 : lx4;
      let ly4 = (s.y * 4) | 0; ly4 = ly4 < 0 ? 0 : ly4 >= LMH ? LMH - 1 : ly4;
      const i3 = (ly4 * LMW + lx4) * 3;
      const lum = (lmS[i3] + lmS[i3 + 1] + lmS[i3 + 2]) * 0.33 * (1 + G.lightning * 2)
                + (lmF[i3] + lmF[i3 + 1] + lmF[i3 + 2]) * 0.33;
      const light = clamp((amb + beam * att) * att * 3.5 + lum, 0.03, 1.15);
      drawSpriteShape(s, sx, floorY, size, light, time);
    });
}

function shade(c, l) {
  return 'rgb(' + ((c[0] * l) | 0) + ',' + ((c[1] * l) | 0) + ',' + ((c[2] * l) | 0) + ')';
}

function drawSpriteShape(s, sx, fy, size, light, time) {
  const u = size / 100;     // 100 unités = 1 case de haut
  ctx.save(); ctx.translate(sx, fy); ctx.scale(u, u);
  const bobble = Math.sin(time * 0.003 + sx) * 1.5;
  // ombre de contact (sauf éléments suspendus ou immatériels)
  let g;
  if (s.type !== 'shaft' && s.type !== 'painting' && s.type !== 'shadow') {
    const shadowW = { mother: 30, cradle: 32, tv: 26, stairs: 22, fusebox: 16,
                      sofa: 40, bed: 42, wardrobe: 28, bookshelf: 30, counter: 38,
                      bathtub: 40, table: 34, clock: 16, shelf: 32 }[s.type] || 13;
    g = ctx.createRadialGradient(0, 0, 1, 0, 0, shadowW);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, shadowW, shadowW * 0.3, 0, 0, 7); ctx.fill();
  }

  switch (s.type) {
    case 'note':
      ctx.fillStyle = shade([226, 219, 200], light);
      ctx.save(); ctx.rotate(0.06);
      ctx.fillRect(-7, -14 + bobble * 0.3, 14, 11);
      ctx.strokeStyle = shade([110, 100, 88], light); ctx.lineWidth = 0.7;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5, -11.5 + i * 3); ctx.lineTo(5, -11.5 + i * 3); ctx.stroke(); }
      ctx.restore();
      break;
    case 'album':
      g = ctx.createLinearGradient(-12, 0, 12, 0);
      g.addColorStop(0, shade([76, 44, 28], light)); g.addColorStop(0.5, shade([106, 64, 42], light)); g.addColorStop(1, shade([70, 40, 26], light));
      ctx.fillStyle = g; ctx.fillRect(-12, -16, 24, 14);
      ctx.fillStyle = shade([168, 146, 112], light);
      ctx.fillRect(-9, -13, 18, 8);
      ctx.fillStyle = shade([60, 36, 24], light);
      ctx.fillRect(-1, -16, 2, 14);
      break;
    case 'key':
      ctx.strokeStyle = shade([196, 164, 82], light); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -16 + bobble * 0.3, 5, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -11 + bobble * 0.3); ctx.lineTo(0, -2); ctx.lineTo(5, -2); ctx.stroke();
      ctx.strokeStyle = shade([255, 240, 170], light * 0.9); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(-1, -17 + bobble * 0.3, 4, 3.5, 5.2); ctx.stroke();
      break;
    case 'fuse':
      g = ctx.createLinearGradient(-5, 0, 5, 0);
      g.addColorStop(0, shade([120, 28, 22], light)); g.addColorStop(0.5, shade([176, 46, 34], light)); g.addColorStop(1, shade([110, 26, 20], light));
      ctx.fillStyle = g; ctx.fillRect(-5, -18, 10, 16);
      ctx.fillStyle = shade([158, 158, 164], light);
      ctx.fillRect(-5, -19, 10, 3); ctx.fillRect(-5, -4, 10, 3);
      break;
    case 'doll':
      ctx.fillStyle = shade([202, 186, 170], light);
      ctx.beginPath(); ctx.ellipse(0, -22, 7, 8, 0, 0, 7); ctx.fill();
      g = ctx.createLinearGradient(0, -16, 0, -2);
      g.addColorStop(0, shade([130, 110, 116], light)); g.addColorStop(1, shade([70, 58, 64], light));
      ctx.fillStyle = g; ctx.fillRect(-6, -16, 12, 14);
      ctx.fillStyle = shade([20, 14, 14], light);
      ctx.fillRect(-3.5, -24, 2, 2); ctx.fillRect(1.5, -24, 2, 2);
      ctx.strokeStyle = shade([20, 14, 14], light); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(0, -19, 2.4, 0.3, Math.PI - 0.3); ctx.stroke(); // le sourire
      break;
    case 'cradle':
      g = ctx.createLinearGradient(0, -34, 0, -8);
      g.addColorStop(0, shade([86, 58, 38], light)); g.addColorStop(1, shade([52, 34, 22], light));
      ctx.fillStyle = g; ctx.fillRect(-26, -34, 52, 26);
      ctx.strokeStyle = shade([74, 50, 34], light); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, -4, 27, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = shade([22, 17, 16], light);
      ctx.fillRect(-22, -31, 44, 20);
      for (let i = 0; i < 5; i++) { // barreaux
        ctx.strokeStyle = shade([86, 58, 38], light); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-20 + i * 10, -34); ctx.lineTo(-20 + i * 10, -10); ctx.stroke();
      }
      break;
    case 'tv': {
      g = ctx.createLinearGradient(0, -34, 0, -4);
      g.addColorStop(0, shade([62, 60, 58], light)); g.addColorStop(1, shade([36, 34, 33], light));
      ctx.fillStyle = g; ctx.fillRect(-20, -34, 40, 30);
      if (G.tvT > 0) {
        for (let i = 0; i < 70; i++) {
          const v = Math.random() * 230 | 0;
          ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          ctx.fillRect(-17 + Math.random() * 34, -31 + Math.random() * 24, 3, 2);
        }
      } else {
        g = ctx.createRadialGradient(-4, -22, 2, 0, -19, 20);
        g.addColorStop(0, shade([42, 50, 54], light)); g.addColorStop(1, shade([14, 17, 19], light));
        ctx.fillStyle = g; ctx.fillRect(-17, -31, 34, 24);
      }
      break;
    }
    case 'fusebox':
      ctx.fillStyle = shade([112, 114, 118], light);
      ctx.fillRect(-12, -52, 24, 30);
      ctx.strokeStyle = shade([70, 72, 76], light); ctx.lineWidth = 1.5;
      ctx.strokeRect(-12, -52, 24, 30);
      ctx.fillStyle = G.flags.power ? 'rgba(120,220,120,0.85)' : 'rgba(220,60,40,0.75)';
      ctx.fillRect(-3, -48, 6, 4);
      break;
    case 'stairs':
      ctx.strokeStyle = shade([134, 122, 106], light); ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(-16, -10 - i * 14); ctx.lineTo(16, -10 - i * 14); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-16, -72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, -2); ctx.lineTo(16, -72); ctx.stroke();
      g = ctx.createLinearGradient(0, -90, 0, -40);
      g.addColorStop(0, 'rgba(190,195,200,0.14)'); g.addColorStop(1, 'rgba(190,195,200,0)');
      ctx.fillStyle = g; ctx.fillRect(-20, -90, 40, 50); // lueur du rez-de-chaussée
      break;
    /* ---------- mobilier de la maison abandonnée ---------- */
    case 'sofa':
      g = ctx.createLinearGradient(0, -36, 0, 0);
      g.addColorStop(0, shade([88, 66, 58], light)); g.addColorStop(1, shade([48, 36, 32], light));
      ctx.fillStyle = g;
      ctx.fillRect(-38, -22, 76, 20);                       // assise
      ctx.fillRect(-38, -40, 8, 38); ctx.fillRect(30, -40, 8, 38); // accoudoirs
      ctx.fillRect(-34, -38, 68, 12);                       // dossier
      ctx.fillStyle = shade([36, 27, 24], light);
      ctx.fillRect(-22, -20, 14, 8);                        // déchirure
      ctx.fillStyle = shade([180, 172, 158], light * 0.8);
      ctx.fillRect(-20, -18, 9, 4);                         // rembourrage qui sort
      break;
    case 'armchair':
      g = ctx.createLinearGradient(0, -42, 0, 0);
      g.addColorStop(0, shade([74, 58, 50], light)); g.addColorStop(1, shade([40, 31, 27], light));
      ctx.fillStyle = g;
      ctx.fillRect(-18, -20, 36, 18);
      ctx.fillRect(-20, -44, 6, 42); ctx.fillRect(14, -44, 6, 42);
      ctx.fillRect(-16, -42, 32, 14);
      break;
    case 'table':
      ctx.fillStyle = shade([84, 60, 40], light);
      ctx.fillRect(-32, -28, 64, 6);
      ctx.fillStyle = shade([56, 40, 28], light);
      ctx.fillRect(-28, -22, 5, 22); ctx.fillRect(23, -22, 5, 22);
      ctx.fillStyle = shade([120, 112, 100], light * 0.75); // vaisselle abandonnée
      ctx.beginPath(); ctx.ellipse(-10, -29, 8, 2.5, 0, 0, 7); ctx.fill();
      break;
    case 'chair':
      ctx.strokeStyle = shade([76, 54, 36], light); ctx.lineWidth = 3.5;
      ctx.strokeRect(-9, -20, 18, 4);
      ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(-8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(-8, -42); ctx.lineTo(8, -42); ctx.lineTo(8, -20); ctx.stroke();
      break;
    case 'chairFallen':
      ctx.save(); ctx.rotate(1.35);
      ctx.strokeStyle = shade([72, 52, 34], light); ctx.lineWidth = 3.5;
      ctx.strokeRect(-9, -20, 18, 4);
      ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(-8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(-8, -42); ctx.lineTo(8, -42); ctx.lineTo(8, -20); ctx.stroke();
      ctx.restore();
      break;
    case 'rockchair': {
      const rock = G.rockT > 0 ? Math.sin(time * 0.0045) * 0.16 : 0;
      ctx.save(); ctx.rotate(rock);
      ctx.strokeStyle = shade([68, 48, 32], light); ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(0, -6, 18, 0.3, Math.PI - 0.3); ctx.stroke(); // patins
      ctx.strokeRect(-10, -22, 20, 4);
      ctx.beginPath(); ctx.moveTo(-9, -22); ctx.lineTo(-11, -52); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -22); ctx.lineTo(11, -52); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-10 + i * 10, -24); ctx.lineTo(-11 + i * 11, -50); ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'bed':
      g = ctx.createLinearGradient(0, -30, 0, 0);
      g.addColorStop(0, shade([140, 132, 118], light)); g.addColorStop(1, shade([78, 72, 64], light));
      ctx.fillStyle = g; ctx.fillRect(-40, -24, 80, 22);    // matelas
      ctx.fillStyle = shade([96, 84, 64], light * 0.55);    // auréoles suspectes
      ctx.beginPath(); ctx.ellipse(-8, -14, 14, 7, 0.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14, -10, 8, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = shade([60, 42, 28], light);
      ctx.fillRect(-44, -38, 6, 36); ctx.fillRect(38, -30, 6, 28); // montants
      ctx.fillStyle = shade([170, 165, 152], light);
      ctx.fillRect(-36, -27, 22, 7);                        // oreiller
      break;
    case 'wardrobe':
      g = ctx.createLinearGradient(-24, 0, 24, 0);
      g.addColorStop(0, shade([62, 42, 28], light)); g.addColorStop(0.5, shade([88, 62, 40], light)); g.addColorStop(1, shade([56, 38, 26], light));
      ctx.fillStyle = g; ctx.fillRect(-24, -84, 48, 82);
      ctx.strokeStyle = shade([34, 24, 16], light); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -82); ctx.lineTo(0, -4); ctx.stroke();
      ctx.save(); ctx.translate(4, -43); ctx.rotate(0.07);  // porte entrouverte
      ctx.fillStyle = shade([30, 22, 18], light);
      ctx.fillRect(0, -39, 20, 78);
      ctx.restore();
      ctx.fillStyle = shade([150, 130, 80], light);
      ctx.fillRect(-6, -46, 3, 6);
      break;
    case 'dresser':
      g = ctx.createLinearGradient(0, -40, 0, 0);
      g.addColorStop(0, shade([92, 66, 44], light)); g.addColorStop(1, shade([58, 42, 30], light));
      ctx.fillStyle = g; ctx.fillRect(-22, -38, 44, 36);
      ctx.strokeStyle = shade([36, 26, 18], light); ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) ctx.strokeRect(-18, -34 + i * 11, 36, 9);
      ctx.fillStyle = shade([150, 130, 80], light);
      ctx.fillRect(-2, -30, 4, 2); ctx.fillRect(-2, -19, 4, 2);
      break;
    case 'bookshelf':
      ctx.fillStyle = shade([66, 46, 30], light);
      ctx.fillRect(-27, -80, 54, 78);
      ctx.fillStyle = shade([20, 15, 12], light);
      ctx.fillRect(-23, -76, 46, 70);
      for (let row = 0; row < 4; row++) {
        ctx.fillStyle = shade([66, 46, 30], light);
        ctx.fillRect(-23, -22 - row * 18, 46, 3);
        for (let i = 0; i < 6; i++) { // livres de guingois, certains tombés
          const bh2 = 10 + hash(row * 9 + i) * 4, lean = (hash(i * 3 + row) - 0.5) * 0.5;
          ctx.save(); ctx.translate(-18 + i * 7, -24 - row * 18); ctx.rotate(lean * (i % 3 === 0 ? 1 : 0.15));
          ctx.fillStyle = shade([60 + hash(i + row * 7) * 60, 40 + hash(i * 5) * 30, 30 + hash(row + i) * 25], light);
          ctx.fillRect(-2.5, -bh2, 5, bh2);
          ctx.restore();
        }
      }
      break;
    case 'clock':
      g = ctx.createLinearGradient(-13, 0, 13, 0);
      g.addColorStop(0, shade([52, 34, 22], light)); g.addColorStop(0.5, shade([84, 56, 36], light)); g.addColorStop(1, shade([48, 32, 20], light));
      ctx.fillStyle = g; ctx.fillRect(-13, -88, 26, 86);
      ctx.fillStyle = shade([196, 188, 168], light);
      ctx.beginPath(); ctx.arc(0, -72, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = shade([30, 24, 20], light); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -72); ctx.lineTo(0, -78); ctx.stroke();      // 3 h 12
      ctx.beginPath(); ctx.moveTo(0, -72); ctx.lineTo(5.5, -70.5); ctx.stroke();
      ctx.fillStyle = shade([26, 20, 16], light);
      ctx.fillRect(-8, -56, 16, 44);
      ctx.fillStyle = shade([170, 150, 100], light * 0.8);
      ctx.beginPath(); ctx.arc(0, -38, 4, 0, 7); ctx.fill(); // balancier figé
      break;
    case 'coatrack':
      ctx.strokeStyle = shade([56, 40, 28], light); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -74); ctx.stroke();
      for (const an of [-0.7, -0.3, 0.4, 0.8]) {
        ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(Math.sin(an) * 12, -70 + Math.cos(an) * 8); ctx.stroke();
      }
      g = ctx.createLinearGradient(0, -70, 0, -30);
      g.addColorStop(0, shade([40, 36, 38], light)); g.addColorStop(1, 'rgba(20,18,20,0)');
      ctx.fillStyle = g;                                     // un manteau oublié
      ctx.beginPath(); ctx.moveTo(-4, -68); ctx.lineTo(12, -66); ctx.lineTo(14, -30); ctx.lineTo(0, -32); ctx.fill();
      break;
    case 'painting':
      ctx.save(); ctx.translate(0, -52); ctx.rotate(0.1);   // de travers
      ctx.fillStyle = shade([110, 90, 44], light);
      ctx.fillRect(-21, -16, 42, 32);
      g = ctx.createLinearGradient(-17, -12, 17, 12);
      g.addColorStop(0, shade([60, 70, 78], light)); g.addColorStop(1, shade([26, 30, 34], light));
      ctx.fillStyle = g; ctx.fillRect(-17, -12, 34, 24);
      ctx.fillStyle = shade([14, 16, 18], light);            // trois silhouettes...
      ctx.beginPath(); ctx.ellipse(-8, -2, 3, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -1, 3, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, 0, 2.4, 4, 0, 0, 7); ctx.fill();
      ctx.restore();
      break;
    case 'blocks':
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.translate(-8 + i * 6, -3 - (i % 2) * 5); ctx.rotate(hash(i * 7.7) * 0.8);
        ctx.fillStyle = shade([120 + hash(i) * 60, 60 + hash(i * 3) * 50, 50], light);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
      break;
    case 'counter':
      g = ctx.createLinearGradient(0, -40, 0, 0);
      g.addColorStop(0, shade([120, 116, 108], light)); g.addColorStop(1, shade([70, 66, 60], light));
      ctx.fillStyle = g; ctx.fillRect(-36, -36, 72, 34);
      ctx.fillStyle = shade([150, 148, 142], light);
      ctx.fillRect(-36, -38, 72, 4);                        // plan de travail
      ctx.fillStyle = shade([60, 64, 68], light);           // évier
      ctx.fillRect(-14, -37, 26, 3);
      ctx.strokeStyle = shade([110, 112, 116], light); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-2, -38); ctx.lineTo(-2, -46); ctx.lineTo(5, -46); ctx.stroke(); // robinet
      ctx.strokeStyle = shade([32, 28, 26], light); ctx.lineWidth = 1.4;
      ctx.strokeRect(-30, -30, 24, 24);                     // placard béant
      ctx.fillStyle = shade([18, 15, 13], light);
      ctx.fillRect(-28, -28, 20, 20);
      break;
    case 'stove':
      g = ctx.createLinearGradient(0, -38, 0, 0);
      g.addColorStop(0, shade([84, 82, 80], light)); g.addColorStop(1, shade([44, 42, 40], light));
      ctx.fillStyle = g; ctx.fillRect(-20, -36, 40, 34);
      ctx.fillStyle = shade([22, 20, 19], light);
      ctx.beginPath(); ctx.ellipse(-9, -37, 6, 2, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9, -37, 6, 2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = shade([28, 26, 25], light); ctx.lineWidth = 1.6;
      ctx.strokeRect(-14, -28, 28, 20);                     // porte du four, entrouverte
      ctx.fillStyle = shade([12, 10, 9], light);
      ctx.fillRect(-14, -12, 28, 4);
      break;
    case 'bathtub':
      g = ctx.createLinearGradient(0, -26, 0, 0);
      g.addColorStop(0, shade([198, 196, 188], light)); g.addColorStop(1, shade([120, 118, 112], light));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -14, 38, 14, 0, 0, 7); ctx.fill();
      ctx.fillRect(-38, -14, 76, 12);
      ctx.fillStyle = shade([16, 22, 24], light);            // eau stagnante noire
      ctx.beginPath(); ctx.ellipse(0, -15, 32, 9, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = shade([90, 88, 84], light); ctx.lineWidth = 1.2;  // porcelaine fendue
      ctx.beginPath(); ctx.moveTo(-24, -8); ctx.lineTo(-15, -2); ctx.lineTo(-17, 0); ctx.stroke();
      ctx.fillStyle = shade([140, 138, 130], light);         // pieds griffes
      ctx.fillRect(-30, -3, 5, 4); ctx.fillRect(25, -3, 5, 4);
      break;
    case 'sink':
      ctx.fillStyle = shade([190, 188, 180], light);
      ctx.beginPath(); ctx.ellipse(0, -34, 14, 5, 0, 0, 7); ctx.fill();
      ctx.fillRect(-5, -32, 10, 30);                         // colonne
      ctx.strokeStyle = shade([110, 108, 102], light); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-8, -33); ctx.lineTo(-2, -26); ctx.stroke(); // fêlure
      ctx.fillStyle = shade([70, 78, 84], light);            // éclat de miroir au-dessus
      ctx.save(); ctx.translate(0, -58); ctx.rotate(0.15);
      ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(8, -11); ctx.lineTo(11, 6); ctx.lineTo(-5, 9); ctx.fill();
      ctx.restore();
      break;
    case 'toilet':
      ctx.fillStyle = shade([186, 184, 176], light);
      ctx.fillRect(-9, -34, 18, 16);                         // réservoir
      ctx.beginPath(); ctx.ellipse(0, -12, 12, 8, 0, 0, 7); ctx.fill();
      ctx.fillRect(-12, -12, 24, 10);
      ctx.strokeStyle = shade([100, 98, 92], light); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(2, -20); ctx.stroke();   // fêlé
      ctx.fillStyle = shade([30, 34, 36], light);
      ctx.beginPath(); ctx.ellipse(0, -13, 7, 4, 0, 0, 7); ctx.fill();
      break;
    case 'shelf':
      ctx.fillStyle = shade([58, 42, 28], light);
      ctx.fillRect(-30, -70, 60, 68);
      ctx.fillStyle = shade([16, 12, 10], light);
      ctx.fillRect(-26, -66, 52, 60);
      for (let row = 0; row < 3; row++) {
        ctx.fillStyle = shade([58, 42, 28], light);
        ctx.fillRect(-26, -24 - row * 19, 52, 3);
        for (let i = 0; i < 4; i++) {
          if (hash(row * 5 + i * 3) < 0.4) continue;        // étagères à moitié vides
          ctx.fillStyle = shade([90 + hash(i * 7 + row) * 50, 95 + hash(i) * 40, 70], light * 0.8);
          ctx.fillRect(-20 + i * 12, -36 - row * 19, 7, 11); // bocaux
        }
      }
      break;
    case 'barrel':
      g = ctx.createLinearGradient(-13, 0, 13, 0);
      g.addColorStop(0, shade([52, 38, 26], light)); g.addColorStop(0.5, shade([84, 60, 40], light)); g.addColorStop(1, shade([48, 34, 24], light));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -18, 14, 18, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = shade([90, 92, 96], light); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -26, 13, 4, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -10, 13.6, 4, 0, 0, 7); ctx.stroke();
      break;
    case 'sheet': // drap suspendu, presque une silhouette
      ctx.globalAlpha = 0.85;
      g = ctx.createLinearGradient(0, -78, 0, 0);
      g.addColorStop(0, shade([150, 148, 142], light)); g.addColorStop(1, shade([70, 70, 68], light));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-20, -78);
      const wob = Math.sin(time * 0.0011 + sx) * 3;
      ctx.bezierCurveTo(-26 + wob, -40, -18 - wob, -16, -22 + wob, 0);
      ctx.lineTo(22 + wob, 0);
      ctx.bezierCurveTo(18 - wob, -20, 26 + wob, -50, 20, -78);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'shaft': { // rai de clair de lune, poussière en suspension
      const lf = 0.55 + G.lightning * 1.3;
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createLinearGradient(14, -95, -8, 0);
      g.addColorStop(0, 'rgba(168,185,225,' + (0.085 * lf) + ')');
      g.addColorStop(1, 'rgba(168,185,225,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(4, -95); ctx.lineTo(26, -95); ctx.lineTo(2, 0); ctx.lineTo(-22, 0); ctx.fill();
      for (let i = 0; i < 7; i++) { // poussière dans le rai
        const dy2 = (time * 0.01 * (0.4 + hash(i * 3.3)) + i * 17) % 90;
        ctx.fillStyle = 'rgba(200,212,240,' + (0.16 * lf * (1 - dy2 / 95)) + ')';
        ctx.fillRect(14 - dy2 * 0.24 + Math.sin(time * 0.001 + i) * 2, -92 + dy2, 1.3, 1.3);
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'shadow':
      ctx.globalAlpha = 0.62;
      g = ctx.createLinearGradient(0, -90, 0, 0);
      g.addColorStop(0, '#020203'); g.addColorStop(1, 'rgba(2,2,3,0.6)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(8, -80); ctx.lineTo(-8, -80); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -88, 8, 10, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'mother': {
      const m = s.ref;
      ctx.globalAlpha = m.alpha;
      const sway = Math.sin(time * 0.004) * 0.05;
      const twitch = hash((time * 0.008) | 0) > 0.86 ? (hash(time | 0) - 0.5) * 7 : 0;
      ctx.translate(twitch, 0);
      ctx.rotate(sway);
      // robe trempée
      g = ctx.createLinearGradient(0, -90, 0, 0);
      g.addColorStop(0, shade([30, 25, 30], Math.max(light, 0.10) * 2.2));
      g.addColorStop(1, '#030203');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-21, 0); ctx.lineTo(21, 0);
      ctx.bezierCurveTo(15, -40, 12, -70, 8, -86);
      ctx.lineTo(-8, -86); ctx.bezierCurveTo(-12, -70, -15, -40, -21, 0); ctx.fill();
      // bras pendants
      ctx.strokeStyle = 'rgba(8,6,8,0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, -74); ctx.quadraticCurveTo(-16, -40, -13, -16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -74); ctx.quadraticCurveTo(16, -40, 13, -16); ctx.stroke();
      // tête pâle sous les cheveux
      g = ctx.createRadialGradient(-2, -97, 1, 0, -95, 10);
      g.addColorStop(0, shade([196, 182, 168], Math.max(light, 0.09)));
      g.addColorStop(1, shade([110, 98, 90], Math.max(light, 0.09)));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -95, 8, 11, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(5,4,5,0.95)'; ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * 2.8, -105);
        ctx.quadraticCurveTo(i * 6, -70, i * 5, -38); ctx.stroke();
      }
      ctx.fillStyle = '#050304';
      ctx.beginPath(); ctx.ellipse(-3, -97, 1.8, 2.6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -97, 1.8, 2.6, 0, 0, 7); ctx.fill();
      // gouttes d'eau
      ctx.strokeStyle = 'rgba(120,150,165,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const dy2 = ((time * 0.12 + i * 33) % 60);
        ctx.beginPath(); ctx.moveTo(-12 + i * 11, -20 + dy2); ctx.lineTo(-12 + i * 11, -16 + dy2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
  ctx.restore();
}

/* ---- poussière volumétrique ---- */
function drawDust(time) {
  if (!G.flash || G.mode !== 'play') return;
  // halo du faisceau
  let g = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, H * 0.62);
  g.addColorStop(0, 'rgba(205,210,220,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const m of motes) {
    m.y -= m.vy * 0.016; // dérive lente vers le haut
    m.x += Math.sin(time * 0.0006 + m.ph) * 0.0004;
    if (m.y < 0) { m.y = 1; m.x = Math.random(); }
    if (m.x < 0) m.x = 1; if (m.x > 1) m.x = 0;
    const dc = Math.hypot((m.x - 0.5) * 1.9, (m.y - 0.5) * 1.25);
    const a = 0.16 * Math.max(0, 1 - dc * 1.7);
    if (a <= 0.005) continue;
    ctx.fillStyle = 'rgba(222,226,236,' + a + ')';
    ctx.fillRect(m.x * W, m.y * H, m.s, m.s);
  }
}

/* ---- post-traitement : vignette, grain, scanlines, glitch, fondu ---- */
function drawPost(time) {
  // vignette dont l'intensité suit Player_Stress
  const v = 0.45 + (G.stress / 100) * 0.42;
  const rg = ctx.createRadialGradient(W / 2, H / 2, H * (0.75 - G.stress / 100 * 0.25), W / 2, H / 2, H * 0.98);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(1, 'rgba(' + (G.stress > 70 ? 28 : 0) + ',0,0,' + v + ')');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  // grain de pellicule
  ctx.globalAlpha = 0.045;
  ctx.drawImage(grain[(time / 50 | 0) % 4], 0, 0, W, H);
  ctx.globalAlpha = 1;

  // scanlines discrètes
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

  // glitch
  if (G.fx.glitchT > 0) {
    for (let i = 0; i < 7; i++) {
      const y = Math.random() * H, h = 5 + Math.random() * 18;
      const sh = (Math.random() - 0.5) * 56;
      ctx.drawImage(canvas, 0, y, W, h, sh, y, W, h);
    }
    for (let i = 0; i < 200; i++) {
      const vv = Math.random() * 255 | 0;
      ctx.fillStyle = 'rgba(' + vv + ',' + vv + ',' + vv + ',0.5)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 5, 2);
    }
  }

  // apparition flash (Agent 03 : virage brusque / hyper-concentration)
  if (G.appar) {
    const k = G.appar.t / 0.17;
    if (k > 0.78) { ctx.fillStyle = 'rgba(238,240,248,0.5)'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = clamp(k * 1.5, 0, 1);
    ghostFace(ctx, W / 2 + G.appar.side * W * 0.17, H * 0.46, H * 0.4,
              { jaw: 0.95, asym: 0.8, eyes: 1, tilt: G.appar.side * 0.13 });
    ctx.globalAlpha = 1;
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
      ctx.font = '19px Georgia, serif';
      ctx.fillStyle = 'rgba(230,225,210,0.85)';
      ctx.fillText(G.prompt, W / 2, H - 40);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(W / 2 - 1.5, H / 2 - 1.5, 3, 3);
    if (!G.flash) {
      ctx.font = '14px Georgia, serif';
      ctx.fillStyle = 'rgba(160,150,140,0.4)';
      ctx.fillText('lampe éteinte — [F]', W / 2, 24);
    }
  }

  if (G.msg) {
    ctx.font = 'italic 21px Georgia, serif';
    ctx.fillStyle = 'rgba(225,218,200,' + clamp(G.msg.t, 0, 1) + ')';
    ctx.fillText(G.msg.text, W / 2, H - 76);
  }

  if (G.mode === 'note' && G.note) {
    ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillRect(0, 0, W, H);
    const pw = 660, ph = H - 100;
    // les mains tremblent quand le stress monte
    const tr = G.stress > 40 ? (G.stress - 40) / 60 : 0;
    const px = W / 2 - pw / 2 + (Math.random() - 0.5) * 4.5 * tr;
    const py = 50 + (Math.random() - 0.5) * 3.5 * tr;
    let g = ctx.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, '#ded4bc'); g.addColorStop(0.5, '#d4c9ae'); g.addColorStop(1, '#c8bb9e');
    ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = 'rgba(120,104,80,0.35)'; ctx.fillRect(px, py, pw, 5);
    ctx.fillStyle = '#3a3026';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(G.note.title, px + pw / 2, py + 42);
    ctx.font = '17px Georgia, serif';
    G.note.body.forEach((line, i) => ctx.fillText(line, px + pw / 2, py + 82 + i * 27));
    ctx.font = 'italic 15px Georgia, serif';
    ctx.fillStyle = '#6b5f4e';
    ctx.fillText('[E] refermer', px + pw / 2, py + ph - 20);
  }

  if (G.debug) {
    ctx.textAlign = 'left';
    ctx.font = '14px monospace';
    ctx.fillStyle = '#7f7';
    ctx.fillText('Stress=' + G.stress.toFixed(1) + ' palier=' + (tier() + 1)
      + ' evt=' + G.evtTimer.toFixed(1) + 's map=' + G.mapName
      + ' boucles=' + G.loops + ' brûlés=' + G.burned, 10, 20);
    ctx.fillText('inv: ' + [...G.inv].join(', '), 10, 38);
  }

  if (G.mode === 'play' && document.pointerLockElement !== canvas) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.font = '22px Georgia, serif'; ctx.fillStyle = '#cfc8b8'; ctx.textAlign = 'center';
    ctx.fillText('Cliquez pour reprendre', W / 2, H / 2);
  }
}

/* ---- écrans titre & fin ---- */
function drawTitle(time) {
  // éclair occasionnel qui découpe la façade
  const lphase = (time % 11000);
  const tl = lphase < 130 ? 1 : lphase < 270 ? 0.45 : 0;
  // ciel de nuit d'orage
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tl > 0 ? '#2a3050' : '#05060b');
  g.addColorStop(0.7, tl > 0 ? '#181c30' : '#0a0b11');
  g.addColorStop(1, '#040407');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // la maison : corps victorien, pignon, porche
  const bx = W / 2, by = H;
  ctx.fillStyle = tl > 0 ? '#10101a' : '#08070b';
  ctx.beginPath();
  ctx.moveTo(bx - 260, by); ctx.lineTo(bx - 260, by - 150);
  ctx.lineTo(bx - 150, by - 235); ctx.lineTo(bx - 40, by - 150);
  ctx.lineTo(bx + 90, by - 150); ctx.lineTo(bx + 90, by - 195);
  ctx.lineTo(bx + 180, by - 255); ctx.lineTo(bx + 270, by - 195);
  ctx.lineTo(bx + 270, by); ctx.fill();
  // bardeaux du toit (lignes du pignon)
  ctx.strokeStyle = 'rgba(40,42,56,' + (0.5 + tl * 0.5) + ')'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(bx - 150 - i * 17, by - 235 + i * 14);
    ctx.lineTo(bx - 150 + i * 17, by - 235 + i * 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 180 - i * 14, by - 255 + i * 9.5);
    ctx.lineTo(bx + 180 + i * 14, by - 255 + i * 9.5); ctx.stroke();
  }
  // cheminée
  ctx.fillStyle = tl > 0 ? '#141320' : '#0a0910';
  ctx.fillRect(bx - 110, by - 262, 26, 50);
  // porche et piliers
  ctx.fillRect(bx - 70, by - 96, 150, 10);
  ctx.fillRect(bx - 64, by - 90, 8, 90); ctx.fillRect(bx + 64, by - 90, 8, 90);
  // porte d'entrée
  ctx.fillStyle = '#040308';
  ctx.fillRect(bx - 18, by - 78, 38, 78);
  // fenêtres condamnées : planches + fentes pâles
  const boardWin = (wx, wy) => {
    ctx.fillStyle = tl > 0 ? '#181826' : '#0c0b12';
    ctx.fillRect(wx, wy, 30, 40);
    ctx.strokeStyle = 'rgba(52,46,40,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(wx, wy + 8); ctx.lineTo(wx + 30, wy + 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, wy + 26); ctx.lineTo(wx + 30, wy + 20); ctx.stroke();
    ctx.fillStyle = 'rgba(190,205,255,' + (0.10 + tl * 0.5) + ')';
    ctx.fillRect(wx + 4, wy + 17, 22, 2.5);
  };
  boardWin(bx - 220, by - 130); boardWin(bx - 120, by - 130); boardWin(bx + 110, by - 130);
  // une seule fenêtre éclairée à l'étage, qui vacille
  const wf = 0.4 + 0.6 * (hash((time / 130) | 0) > 0.25 ? 1 : 0.2);
  ctx.fillStyle = 'rgba(216,186,120,' + (0.5 * wf) + ')';
  ctx.fillRect(bx + 162, by - 188, 22, 30);
  ctx.strokeStyle = 'rgba(10,8,8,0.9)'; ctx.lineWidth = 2;
  ctx.strokeRect(bx + 162, by - 188, 22, 30);
  ctx.beginPath(); ctx.moveTo(bx + 173, by - 188); ctx.lineTo(bx + 173, by - 158); ctx.stroke();
  // pluie battante
  ctx.strokeStyle = 'rgba(150,165,195,0.16)'; ctx.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const rx = (hash(i * 7.3) * W + time * (0.35 + hash(i) * 0.25)) % W;
    const ry = (hash(i * 3.1) * H + time * (0.8 + hash(i * 2) * 0.4)) % H;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 14); ctx.stroke();
  }
  // nappes de brume
  for (let i = 0; i < 3; i++) {
    const my = H - 60 - i * 26 + Math.sin(time * 0.0003 + i * 2) * 8;
    g = ctx.createLinearGradient(0, my - 18, 0, my + 18);
    g.addColorStop(0, 'rgba(120,125,140,0)'); g.addColorStop(0.5, 'rgba(120,125,140,0.045)'); g.addColorStop(1, 'rgba(120,125,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, my - 18, W, 36);
  }

  ctx.textAlign = 'center';
  const jit = hash((time / 90) | 0) > 0.93 ? (Math.random() - 0.5) * 5 : 0;
  ctx.save();
  ctx.shadowColor = 'rgba(150,10,10,0.7)'; ctx.shadowBlur = 26;
  ctx.font = '52px Georgia, serif';
  ctx.fillStyle = 'rgba(196,32,30,0.92)';
  ctx.fillText('LA MAISON CREUSE', W / 2 + jit, 130);
  ctx.restore();
  ctx.font = 'italic 19px Georgia, serif';
  ctx.fillStyle = 'rgba(170,162,148,0.8)';
  ctx.fillText('un scénario d’horreur psychologique — DT-GEN', W / 2, 168);

  ctx.font = 'italic 18px Georgia, serif';
  ctx.fillStyle = 'rgba(186,176,158,0.85)';
  const letter = [
    'Robert, votre frère, a disparu il y a un mois.',
    'Sa dernière lettre ne contenait qu’une adresse et trois mots :',
    '« Finis-le, toi. »',
  ];
  letter.forEach((l, i) => ctx.fillText(l, W / 2, 218 + i * 28));

  ctx.font = '17px Georgia, serif';
  ctx.fillStyle = 'rgba(150,144,132,0.75)';
  const lines = [
    'ZQSD / WASD — se déplacer        souris — regarder',
    'E — interagir / lire        F — lampe torche',
    '(casque audio fortement recommandé)',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 330 + i * 26));
  const pulse = 0.6 + Math.sin(time * 0.002) * 0.2;
  ctx.font = '22px Georgia, serif';
  ctx.fillStyle = 'rgba(220,212,195,' + pulse + ')';
  ctx.fillText('— cliquez pour entrer —', W / 2, 470);
  ctx.globalAlpha = 0.05;
  ctx.drawImage(grain[(time / 60 | 0) % 4], 0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawEnd(time) {
  if (!G.endStart) G.endStart = time;
  const t = (time - G.endStart) / 1000;
  ctx.textAlign = 'center';
  ctx.font = '44px Georgia, serif';
  ctx.fillStyle = 'rgba(200,195,180,' + clamp(t / 2, 0, 1) + ')';
  ctx.fillText('VOUS ÊTES SORTI', W / 2, 150);
  const epilogue = [
    'Lily s’est noyée dans la cave une nuit de crue, il y a trois ans,',
    'derrière une porte que son père venait de fermer à clé.',
    'Éléanore est descendue la rejoindre un an plus tard, sa poupée dans les bras.',
    '',
    'Robert ne s’est jamais pardonné. Vous savez, maintenant,',
    'qu’il n’a jamais vraiment quitté la maison.',
    '',
    'Vous avez brûlé ce qui les retenait tous. Derrière vous,',
    'pour la première fois en trois ans, plus personne ne pleure.',
  ];
  ctx.font = 'italic 19px Georgia, serif';
  epilogue.forEach((l, i) => {
    const a = clamp((t - 1.5 - i * 0.7) / 1.2, 0, 0.85);
    ctx.fillStyle = 'rgba(165,158,144,' + a + ')';
    ctx.fillText(l, W / 2, 225 + i * 30);
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
