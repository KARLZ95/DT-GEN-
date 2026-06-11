# La Maison Creuse

Jeu d'horreur psychologique jouable dans le navigateur — implémentation du
[Game Design Document](docs/GDD.md) DT-GEN. Vue à la première personne,
rendu raycasting façon VHS, **zéro dépendance, zéro asset** : tout est
généré procéduralement (graphismes en canvas 2D, sons synthétisés en WebAudio).

> 🎧 Casque audio fortement recommandé (cris binauraux, sons spatialisés).

## Jouer

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
npx serve .        # ou : python3 -m http.server
```

| Touche | Action |
|---|---|
| `ZQSD` / `WASD` / flèches | Se déplacer |
| Souris | Regarder |
| `E` | Interagir / lire / refermer |
| `F` | Lampe torche |
| `F3` | Overlay debug (stress, palier, inventaire) |

**Objectif :** reconstituer le drame de cette famille pour déverrouiller la
porte de sortie. Lisez les notes. Brûlez ce qu'il faut brûler.

## Ce qui est implémenté (fidèle au GDD)

- **`Player_Stress` (0–100), variable cachée** — monte dans le noir, face aux
  murs et après chaque échec de puzzle ; redescend sinon. Jamais affichée :
  elle se ressent (vignette, battements de cœur).
- **Événements paranormaux dynamiques à 3 paliers** —
  - stress < 30 : 10 % / 30 s — craquements, soupirs, ampoules qui grésillent,
    portes entrouvertes hors champ, objets déplacés (gaslighting) ;
  - 30–70 : 20 % / 30 s — pleurs d'enfant, pas qui imitent le joueur avec 1 s
    de retard, silhouette fugace au bout du couloir ;
  - ≥ 70 : 35 % / 20 s — murs qui saignent, téléviseur statique à plein
    volume, portes qui claquent violemment.
- **3 jumpscares scriptés** —
  1. *Le Reflet du Miroir* : clé de la cave en poche + entrée dans le couloir
     principal → le reflet se retourne et s'ouvre la gorge, cri binaural
     **derrière** le joueur ;
  2. *Le Berceau* : boîte à musique jouée à l'envers à l'approche, entité
     difforme qui jaillit vers la caméra, 0,5 s de statique + blast haute
     fréquence ;
  3. *Effondrement de la Cuisine* : ramasser le fusible → 2 s de silence
     absolu, placards qui claquent, vaisselle brisée, pendu qui tombe du
     plafond puis disparaît.
- **Acte I — Exploration & gaslighting** : la maison, l'album photo de
  famille, les notes qui racontent le drame d'Éléanore et Lily.
- **Acte II — Distorsion spatiale** : la porte de la cave ouvre sur un
  couloir en boucle infinie qui se **rétrécit à chaque passage**.
- **Acte III — La Traque** : la cave inondée, l'Entité (la Mère) chasse le
  joueur (pathfinding + ligne de vue) ; brûler les **3 objets maudits**
  (l'album, la boîte à musique, la poupée) dans la chaudière pour ouvrir la
  sortie.

## Structure

```
index.html        point d'entrée (aucun build)
src/game.js       moteur : raycasting, stress, événements RNG, jumpscares,
                  actes, IA de la Mère, rendu & post-traitement VHS
src/audio.js      tous les sons, synthétisés en WebAudio (HRTF binaural)
src/maps.js       les 3 niveaux + textes des notes
docs/GDD.md       le Game Design Document d'origine
test/validate.js  cohérence des cartes        (node test/validate.js)
test/smoke.js     partie complète headless     (node test/smoke.js)
```

## Tests

```bash
node test/validate.js   # cohérence des cartes et textes
node test/smoke.js      # déroule une partie complète (3 jumpscares, 3 actes, fin)
```
