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
      '####E###########################',
      '#......#........#.......#......#',
      '#......#........#.......#......#',
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
      '##########################B#####',
    ],
    spawn: { x: 3.5, y: 2.5, a: Math.PI / 2 },
    // Zone de déclenchement du Jumpscare_01 : tout le couloir principal
    // (GDD : Player_HasKey_Basement && Player_Enters_MainCorridor)
    mirrorZone: { x0: 0.5, x1: 31.5, y0: 5.6, y1: 8.05 },
    sprites: [
      { type: 'note',   id: 'note_foyer',   x: 2.0,  y: 1.6 },
      { type: 'album',  id: 'album',        x: 12.0, y: 2.5 },
      { type: 'tv',     id: 'tv',           x: 9.2,  y: 1.7 },
      { type: 'cradle', id: 'cradle',       x: 20.5, y: 2.0 },
      { type: 'note',   id: 'note_nursery', x: 18.2, y: 3.6 },
      { type: 'key',    id: 'key_basement', x: 27.5, y: 2.5 },
      { type: 'note',   id: 'note_bedroom', x: 29.2, y: 3.6 },
      { type: 'fuse',   id: 'fuse',         x: 6.5,  y: 11.5 },
      { type: 'fusebox',id: 'fusebox',      x: 24.5, y: 12.6 },
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
    sprites: [
      { type: 'doll', id: 'doll', x: 21.5, y: 11.3 },
    ],
  },
};

/* Textes des notes & documents (le puzzle familial du GDD) */
const TEXTS = {
  note_foyer: {
    title: 'Mot épinglé dans l’entrée',
    body: [
      'Les plombs sautent sans arrêt depuis... depuis la nuit du drame.',
      'Il reste un fusible dans la cuisine. Le tableau électrique',
      'est dans la pièce du fond, près de la porte de la cave.',
      '',
      'Ne descends pas sans lumière. Elle déteste le noir',
      'autant qu’elle nous détestait à la fin.',
      '                                        — R.',
    ],
  },
  album: {
    title: 'Album photo de famille',
    body: [
      'Des photos jaunies. Éléanore tient sa fille Lily contre elle.',
      'Page après page, le sourire d’Éléanore s’efface.',
      'La dernière photo est brûlée. Au dos, une écriture tremblante :',
      '',
      '« Trois choses la retiennent ici :',
      '  cet album, la berceuse de Lily, et la poupée.',
      '  La chaudière brûle encore, en bas.',
      '  Rends-les aux flammes. Libère-les. »',
    ],
  },
  note_nursery: {
    title: 'Page de journal — chambre d’enfant',
    body: [
      '« Lily ne dort que si la boîte à musique joue sa berceuse.',
      'Cette nuit, je l’ai entendue jouer toute seule.',
      'À l’envers.',
      '',
      'Éléanore est restée des heures penchée sur le berceau,',
      'à chantonner. Le berceau est vide depuis trois ans. »',
    ],
  },
  note_bedroom: {
    title: 'Lettre inachevée — chambre',
    body: [
      '« Je n’aurais jamais dû fermer la cave à clé.',
      'L’eau monte là-dessous, comme cette nuit-là.',
      'Je l’entends marcher dans l’eau. Elle berce quelque chose.',
      '',
      'Si quelqu’un lit ceci : la clé est sur la commode.',
      'Brûlez tout ce qu’elle aimait. C’est la seule porte de sortie. »',
    ],
  },
};

window.MAPS = MAPS;
window.TEXTS = TEXTS;
