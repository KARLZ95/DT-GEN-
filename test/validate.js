/* Vérifications hors-navigateur : syntaxe + cohérence des cartes.
 * Usage : node test/validate.js                                   */
'use strict';

global.window = {};
require('../src/maps.js');
const { MAPS, TEXTS } = global.window;

let errors = 0;
const fail = (msg) => { console.error('ÉCHEC : ' + msg); errors++; };

for (const [name, m] of Object.entries(MAPS)) {
  const w = m.grid[0].length;
  m.grid.forEach((row, i) => {
    if (row.length !== w) fail(`${name} ligne ${i} : largeur ${row.length} != ${w}`);
  });
  // bords clos (sauf portes E/B volontairement dans le mur d'enceinte)
  m.grid.forEach((row, iy) => {
    for (let ix = 0; ix < row.length; ix++) {
      const edge = iy === 0 || iy === m.grid.length - 1 || ix === 0 || ix === w - 1;
      if (edge && !'#EBMF'.includes(row[ix])) fail(`${name} (${ix},${iy}) : bord ouvert '${row[ix]}'`);
    }
  });
  // spawn sur une case traversable
  const sp = m.spawn;
  const t = m.grid[Math.floor(sp.y)][Math.floor(sp.x)];
  if (!'.S'.includes(t)) fail(`${name} : spawn sur '${t}'`);
  // sprites sur cases traversables
  (m.sprites || []).forEach(s => {
    const st = m.grid[Math.floor(s.y)][Math.floor(s.x)];
    if (!'.S'.includes(st)) fail(`${name} sprite ${s.id} sur '${st}' (${s.x},${s.y})`);
  });
}

// la maison contient bien les éléments clés du GDD
const house = MAPS.house.grid.join('');
['E', 'B', 'M'].forEach(c => { if (!house.includes(c)) fail(`house : tuile '${c}' absente`); });
if (!MAPS.basement.grid.join('').includes('F')) fail('basement : chaudière absente');
['note_foyer', 'album', 'note_nursery', 'note_bedroom'].forEach(id => {
  if (!TEXTS[id]) fail(`texte manquant : ${id}`);
});
const ids = MAPS.house.sprites.map(s => s.id);
['album', 'key_basement', 'fuse', 'cradle'].forEach(id => {
  if (!ids.includes(id)) fail(`house : sprite manquant ${id}`);
});

if (errors) { process.exit(1); }
console.log('OK — cartes et textes valides.');
