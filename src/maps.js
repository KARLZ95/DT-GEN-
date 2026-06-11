/* ============================================================
 * MAPS — niveaux du jeu (grilles de caractères)
 *   '#' mur          '.' sol           'd' porte (ouvrable)
 *   'E' porte de sortie (verrouillée)  'B' porte de la cave
 *   'M' miroir mural  'F' chaudière    'S' escalier
 * Acte I : la maison — Acte II : le couloir — Acte III : la cave
 * ============================================================ */
'use strict';

const MAPS = {

  house: {
    name: 'house',
    ambient: 0.26,
    water: false,
    grid: [
      '####E#####W#########W######W####',
      '#......#........#.......#......#',
      'W......#........#.......#......#',
      '#......#........#.......#......#',
      '#......#........#.......#......#',
      '###d#######d########d######d####',
      '#..............................#',
      '#..............................#',
      '####d#########MMMM#d####d#######',
      '#............#........#........#',
      '#............#........#........#',
      '#............#........#........#',
      '#............#........#........#',
      '#............#........#........#',
      '######W##########W########B#####',
    ],
    spawn: { x: 3.5, y: 2.5, a: Math.PI / 2 },
    // Zone de déclenchement du Jumpscare_01 : tout le couloir principal
    // (GDD : Player_HasKey_Basement && Player_Enters_MainCorridor)
    mirrorZone: { x0: 0.5, x1: 31.5, y0: 5.6, y1: 8.05 },
    // clair de lune par les volets condamnés (occlusion calculée au bake)
    lights: [
      { x: 10.5, y: 1.0,  r: 0.55, g: 0.65, b: 0.95, i: 1.1, moon: true },
      { x: 20.5, y: 1.0,  r: 0.55, g: 0.65, b: 0.95, i: 1.1, moon: true },
      { x: 27.5, y: 1.0,  r: 0.55, g: 0.65, b: 0.95, i: 1.1, moon: true },
      { x: 1.0,  y: 2.5,  r: 0.55, g: 0.65, b: 0.95, i: 0.9, moon: true },
      { x: 6.5,  y: 13.0, r: 0.55, g: 0.65, b: 0.95, i: 1.0, moon: true },
      { x: 17.5, y: 13.0, r: 0.55, g: 0.65, b: 0.95, i: 1.0, moon: true },
    ],
    sprites: [
      // — objets de la quête —
      { type: 'note',   id: 'note_foyer',   x: 2.0,  y: 1.6 },
      { type: 'album',  id: 'album',        x: 12.0, y: 2.5 },
      { type: 'tv',     id: 'tv',           x: 9.2,  y: 1.7 },
      { type: 'cradle', id: 'cradle',       x: 20.5, y: 2.0 },
      { type: 'note',   id: 'note_nursery', x: 18.2, y: 3.6 },
      { type: 'key',    id: 'key_basement', x: 27.5, y: 2.45 },
      { type: 'note',   id: 'note_bedroom', x: 29.2, y: 3.6 },
      { type: 'fuse',   id: 'fuse',         x: 6.5,  y: 11.5 },
      { type: 'fusebox',id: 'fusebox',      x: 24.5, y: 12.6 },
      // — entrée —
      { type: 'clock',     id: 'clock',     x: 1.5,  y: 1.5 },
      { type: 'coatrack',  id: 'f1',        x: 5.8,  y: 1.3 },
      // — salon —
      { type: 'sofa',      id: 'f2',        x: 9.5,  y: 3.6 },
      { type: 'armchair',  id: 'f3',        x: 14.2, y: 3.4 },
      { type: 'table',     id: 'f4',        x: 10.8, y: 2.2 },
      { type: 'bookshelf', id: 'f5',        x: 14.7, y: 1.3 },
      { type: 'painting',  id: 'f6',        x: 11.5, y: 1.12 },
      // — chambre d'enfant —
      { type: 'rockchair', id: 'rockchair', x: 18.0, y: 2.8 },
      { type: 'dresser',   id: 'f7',        x: 22.5, y: 1.4 },
      { type: 'blocks',    id: 'f8',        x: 19.4, y: 3.4 },
      // — chambre parentale —
      { type: 'bed',       id: 'f9',        x: 26.2, y: 2.2 },
      { type: 'wardrobe',  id: 'f10',       x: 29.5, y: 1.4 },
      { type: 'dresser',   id: 'f11',       x: 27.5, y: 2.85 },
      { type: 'painting',  id: 'f12',       x: 26.0, y: 1.12 },
      // — cuisine —
      { type: 'counter',   id: 'f13',       x: 2.2,  y: 9.6 },
      { type: 'stove',     id: 'f14',       x: 4.0,  y: 9.55 },
      { type: 'table',     id: 'f15',       x: 7.5,  y: 11.5 },
      { type: 'chair',     id: 'f16',       x: 8.6,  y: 11.1 },
      { type: 'chairFallen', id: 'f17',     x: 5.9,  y: 12.2 },
      { type: 'shelf',     id: 'f18',       x: 11.2, y: 9.6 },
      // — salle de bain (porcelaine fendue) —
      { type: 'bathtub',   id: 'bathtub',   x: 15.6, y: 10.2 },
      { type: 'sink',      id: 'sink',      x: 17.8, y: 9.55 },
      { type: 'toilet',    id: 'f19',       x: 20.6, y: 9.7 },
      // — remise de la cave —
      { type: 'barrel',    id: 'f20',       x: 23.6, y: 11.5 },
      { type: 'shelf',     id: 'f21',       x: 29.3, y: 9.7 },
      { type: 'barrel',    id: 'f22',       x: 28.8, y: 12.4 },
      // — rais de lumière des fenêtres —
      { type: 'shaft', id: 's1', x: 10.5, y: 1.5 },
      { type: 'shaft', id: 's2', x: 20.5, y: 1.5 },
      { type: 'shaft', id: 's3', x: 27.5, y: 1.5 },
      { type: 'shaft', id: 's4', x: 6.5,  y: 12.5 },
      { type: 'shaft', id: 's5', x: 17.5, y: 12.5 },
    ],
  },

  // Acte II : couloir en boucle infinie qui se rétrécit (cf. game.js : hallOverride)
  hall: {
    name: 'hall',
    ambient: 0.16,
    water: false,
    grid: [
      '##########################',
      '#........................#',
      '#........................#',
      '#........................#',
      '##########################',
    ],
    spawn: { x: 1.6, y: 2.5, a: 0 },
    sprites: [],
  },

  basement: {
    name: 'basement',
    ambient: 0.11,
    water: true,
    grid: [
      '###########FF###########',
      '#S.....................#',
      '#......................#',
      '#...##.....##.....##...#',
      '#...##.....##.....##...#',
      '#......................#',
      '#......................#',
      '#...##.....##.....##...#',
      '#...##.....##.....##...#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '########################',
    ],
    spawn: { x: 1.6, y: 1.6, a: 0.5 },
    motherSpawn: { x: 12.5, y: 10.5 },
    lights: [
      { x: 12.0, y: 1.3, r: 1.0, g: 0.46, b: 0.13, i: 2.4, fire: true }, // la chaudière
    ],
    sprites: [
      { type: 'doll',   id: 'doll', x: 21.5, y: 11.3 },
      { type: 'barrel', id: 'b1',   x: 4.5,  y: 11.5 },
      { type: 'barrel', id: 'b2',   x: 18.5, y: 2.6 },
      { type: 'shelf',  id: 'b3',   x: 22.6, y: 5.5 },
      { type: 'sheet',  id: 'b4',   x: 9.5,  y: 5.5 },
      { type: 'sheet',  id: 'b5',   x: 15.5, y: 9.5 },
    ],
  },
};

/* Textes des notes & documents — le drame familial, dans l'ordre :
 * il y a 3 ans, une nuit de crue, Lily (4 ans) se cache dans la cave
 * que Robert venait de fermer à clé ; l'eau monte, personne ne l'entend
 * à temps. Éléanore sombre — berceau vide, boîte à musique, poupée —
 * puis descend rejoindre sa fille un an plus tard. Robert reste seul
 * deux ans avec Elle, comprend ce qui La retient, n'a pas la force de
 * le brûler, et disparaît après avoir écrit à son frère : le joueur.  */
const TEXTS = {
  note_foyer: {
    title: 'Mot épinglé dans l’entrée — l’écriture de Robert',
    body: [
      'Si tu es venu, c’est que tu as reçu ma lettre. Pardon.',
      'Les plombs sautent sans arrêt depuis la nuit de la crue.',
      'Il reste un fusible dans la cuisine ; le tableau électrique',
      'est dans la pièce du fond, près de la porte de la cave.',
      '',
      'Remets le courant avant de descendre. Elle préfère le noir.',
      'Pas toi.',
      '                                        — Robert',
    ],
  },
  album: {
    title: 'Album photo de famille',
    body: [
      'Des photos jaunies. Éléanore tient sa fille Lily contre elle.',
      'Anniversaires, jardin, un berceau neuf. Page après page,',
      'les sourires s’éteignent. La dernière photo est brûlée.',
      'Au dos, l’écriture tremblante de Robert :',
      '',
      '« Trois choses la retiennent entre ces murs :',
      '  cet album, la berceuse de Lily, et la poupée.',
      '  La chaudière brûle encore, en bas. Il faudrait les rendre',
      '  aux flammes. J’ai essayé. Cent fois. C’est tout ce qui',
      '  me reste d’elles. Toi, tu pourras. »',
    ],
  },
  note_nursery: {
    title: 'Journal de Robert — chambre d’enfant',
    body: [
      '« Trois ans que Lily est partie, et Éléanore monte encore',
      'chaque soir remonter la boîte à musique. Elle se penche sur',
      'le berceau vide et chantonne pendant des heures.',
      '',
      'Hier, la berceuse a joué toute seule. À l’envers.',
      'Éléanore a souri pour la première fois depuis la crue.',
      'C’est ce sourire qui me fait peur. »',
      '',
      '   (la page suivante est datée d’un an plus tard, et vide)',
    ],
  },
  note_bedroom: {
    title: 'Dernière lettre de Robert — chambre',
    body: [
      '« C’est moi qui avais fermé la cave à clé, ce soir-là,',
      'à cause de la crue. Je ne savais pas que Lily jouait en bas.',
      'On a entendu les coups sous le plancher trop tard.',
      '',
      'Éléanore est descendue la rejoindre un an après, sa poupée',
      'dans les bras. Moi, je suis resté deux ans avec ce qui',
      'reste d’elle. Je n’ai pas eu la force de brûler leurs choses.',
      '',
      'Petit frère : la clé de la cave est sur la commode.',
      'Brûle tout ce qu’elle aimait. C’est la seule porte de sortie,',
      'pour elles comme pour toi. Ne me cherche pas. »',
    ],
  },
};

window.MAPS = MAPS;
window.TEXTS = TEXTS;
