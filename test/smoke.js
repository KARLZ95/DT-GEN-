/* Test de fumée hors-navigateur : déroule la partie complète
 * (3 jumpscares + 3 actes + fin) avec des stubs DOM/Audio.
 * Usage : node test/smoke.js                                     */
'use strict';

/* ---------- stubs DOM / Audio ---------- */
global.window = global;

const gradient = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
  get(_, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'canvas') return fakeCanvas;
    return () => {};
  },
  set() { return true; },
});

const listeners = {};
const fakeCanvas = {
  width: 0, height: 0,
  getContext: () => ctxProxy,
  addEventListener: (ev, fn) => { (listeners['canvas:' + ev] ||= []).push(fn); },
  requestPointerLock() {},
};

global.document = {
  getElementById: () => fakeCanvas,
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxProxy }),
  pointerLockElement: fakeCanvas,
  exitPointerLock() {},
};
global.addEventListener = (ev, fn) => { (listeners[ev] ||= []).push(fn); };

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };

global.SFX = class {
  constructor() {
    return new Proxy({}, { get: (_, k) => (k === 'now' ? 0 : () => 0) });
  }
};

require('../src/maps.js');
require('../src/game.js');

const G = global.window.__G;

/* ---------- pilote ---------- */
let now = 0;
function runFrames(seconds) {
  const steps = Math.ceil(seconds / 0.016);
  for (let i = 0; i < steps; i++) { now += 16; rafCb(now); }
}
function press(code) { (listeners.keydown || []).forEach(fn => fn({ code, preventDefault() {} })); }
function release(code) { (listeners.keyup || []).forEach(fn => fn({ code })); }
function click() { (listeners['canvas:click'] || []).forEach(fn => fn()); }
function teleport(x, y, a) { G.player.x = x; G.player.y = y; G.player.a = a; }

let failures = 0;
function expect(cond, label) {
  if (cond) console.log('  ok — ' + label);
  else { console.error('  ÉCHEC — ' + label); failures++; }
}

/* ---------- scénario complet ---------- */
runFrames(0.2);
expect(G.mode === 'title', 'écran titre');

click();
runFrames(0.5);
expect(G.mode === 'play' && G.mapName === 'house', 'Acte I : la maison');

// déplacement clavier
const x0 = G.player.x;
teleport(3.5, 3.0, -Math.PI / 2);
press('KeyW'); runFrames(0.3); release('KeyW');
expect(G.player.y < 3.0, 'déplacement avant');

// lecture d'une note
teleport(2.6, 1.9, Math.PI + 0.5); press('KeyE');
expect(G.mode === 'note', 'lecture de note');
press('KeyE');
expect(G.mode === 'play', 'note refermée');

// album (objet maudit n°1)
teleport(12.0, 3.3, -Math.PI / 2); press('KeyE');
expect(G.inv.has('album'), 'album ramassé');
press('KeyE'); // referme la note de l'album

// berceau : Jumpscare_02 puis boîte à musique
teleport(20.5, 3.0, -Math.PI / 2); press('KeyE');
expect(G.mode === 'cut', 'Jumpscare_02 (berceau) déclenché');
runFrames(2.0);
expect(G.mode === 'play' && G.flags.cradleDone, 'Jumpscare_02 terminé');
press('KeyE');
expect(G.inv.has('music_box'), 'boîte à musique récupérée');

// fusible : Jumpscare_03 (silence 2 s puis cuisine)
teleport(6.5, 12.3, -Math.PI / 2); press('KeyE');
expect(G.inv.has('fuse'), 'fusible ramassé');
runFrames(2.3);
expect(G.mode === 'cut', 'Jumpscare_03 (cuisine) déclenché');
runFrames(2.0);
expect(G.mode === 'play' && G.flags.j3, 'Jumpscare_03 terminé');

// clé de la cave
teleport(27.5, 3.3, -Math.PI / 2); press('KeyE');
expect(G.inv.has('key_basement'), 'clé de la cave ramassée');

// Jumpscare_01 : clé en poche + entrée dans le couloir principal
teleport(27.4, 4.3, Math.PI / 2);
press('KeyE'); // ouvre la porte de la chambre
press('KeyW'); runFrames(1.2); release('KeyW');
expect(G.flags.j1, 'Jumpscare_01 (miroir) déclenché');
runFrames(4.2);
expect(G.mode === 'play', 'Jumpscare_01 terminé');

// tableau électrique : le fusible y prend place
teleport(24.5, 11.9, Math.PI / 2); press('KeyE');
expect(G.flags.power && !G.inv.has('fuse'), 'fusible installé');

// Acte II : porte de la cave -> couloir en boucle
teleport(26.5, 13.2, Math.PI / 2); press('KeyE');
runFrames(1.5);
expect(G.mapName === 'hall', 'Acte II : le couloir');
for (let loop = 1; loop <= 3; loop++) {
  teleport(24.0, 2.5, 0);
  press('KeyW'); runFrames(0.5); release('KeyW');
  expect(G.loops === loop, 'boucle ' + loop + ' du couloir');
}
teleport(24.0, 2.5, 0);
press('KeyW'); runFrames(0.5); release('KeyW');
runFrames(1.5);
expect(G.mapName === 'basement', 'Acte III : la cave');

// la Mère s'active
runFrames(3.5);
expect(G.mother && G.mother.active, 'la Mère chasse');

// la poupée (objet maudit n°3)
teleport(21.5, 12.1, -Math.PI / 2); press('KeyE');
expect(G.inv.has('doll'), 'poupée ramassée');

// brûler les 3 objets maudits dans la chaudière
teleport(11.9, 1.7, -Math.PI / 2);
G.mother.x = 20; G.mother.y = 11; G.mother.path = []; // qu'elle ne nous attrape pas pendant le rituel
press('KeyE'); press('KeyE'); press('KeyE');
expect(G.burned === 3, 'trois objets maudits brûlés');
expect(G.flags.purged && G.flags.exitOpen, 'maison purgée, sortie ouverte');

// remonter et sortir
teleport(1.5, 1.7, -Math.PI / 2); press('KeyE');
runFrames(1.5);
expect(G.mapName === 'house', 'retour dans la maison');
teleport(4.5, 1.5, -Math.PI / 2); press('KeyE');
runFrames(1.5);
expect(G.mode === 'end', 'fin : vous êtes sorti');

// le moteur tourne encore sans erreur sur l'écran de fin
runFrames(2.0);

if (failures) { console.error(failures + ' échec(s).'); process.exit(1); }
console.log('OK — partie complète déroulée sans erreur.');
