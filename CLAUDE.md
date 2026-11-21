# Gras-Fond, notes pour Claude

Jeu de sous-marin Porkonia de Kenny (continuité « Fun », celle de Douzi). Vite + three.js 0.170, JavaScript sans framework. Textes du jeu en français.

## Architecture
- `src/main.js` : rendu, boucle, physique du sous-marin, pilote (marche / assis), animation de l'intérieur.
  Deux scènes : `outside` (monde, brouillard) puis `inside` (intérieur, ses propres lumières), dessinée par-dessus avec `clearDepth`. Le bloom s'applique au tout.
- `src/sub.js` : intérieur de La Truffe (repère local, avant vers -z, plancher à y = -1.05), commandes 3D (manche, télégraphe des machines = gaz, volants des ballasts, cadrans à aiguilles 3D), collisions à pied (boîtes x/z). `animateSub()` fait bouger tout l'intérieur.
- `src/textures.js` : matières peintes en canvas (couleur + carte de normales + rugosité) : coque rivetée, tôle larmée, cuir capitonné, bois, peinture marteau, faces de cadrans, plaques.
- `src/world.js` : relief `H(x, z)` (zone de 1 km, profondeur vers -z), décor instancié par cases de 100 m, poissons, lumière selon la profondeur, épave du Gras-Fond.
- `src/input.js` : clavier, souris (pointer lock), tactile.

## Règles venues de Kenny
- Style « Porkonia 3D années 90 » : cartoon coloré, pas de photoréalisme. Palette Porkonia : bordeaux et crème, laiton.
- Pas de texte affiché en continu : seulement une indication quand on peut interagir.
- Pas de sons synthétisés bip-bip : de vrais bruitages (libres de droits ou générés), à ajouter plus tard.
- Le cochon citoyen Porko et le cochon standard à quatre pattes viennent du canon (voir le dépôt porkonia-bible).
- Feuille de route : prototype de ressenti d'abord, puis récupération et améliorations, puis guerre. Ne pas passer à l'étape suivante sans son accord.

## Essais
`window.__gf` expose l'état (`S` sous-marin, `P` pilote), `tp(x, y, z, cap)` et `sit()`.
