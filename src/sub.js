// L'intérieur de La Truffe : trois pièces (poste de pilotage, salle des machines, soute),
// les commandes en 3D qui bougent sous les mains, et les collisions pour marcher dedans.
// Repère local : l'avant est vers -z, le plancher est à y = -1.05.
import * as THREE from 'three';
import { TAU, clamp, mulberry } from './noise.js';

export const FLOOR = -1.05;
export const EYE = 1.2;          // un citoyen Porko fait 1,30 m
const R = 1.75;                 // rayon intérieur de la coque
const Z_DOME = -5.6, Z_STERN = 6.4, BULK = [-2.8, 2.2], DOOR = 0.38;

// ---------------------------------------------------------------- textures peintes
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function grime(g, w, h, n, a, seed) {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = 4 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(60,35,20,${a * r()})`); gr.addColorStop(1, 'rgba(60,35,20,0)');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
}
function rivet(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
  gr.addColorStop(0, 'rgba(255,248,230,.9)'); gr.addColorStop(.6, 'rgba(150,130,100,.8)'); gr.addColorStop(1, 'rgba(40,25,15,.8)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
const hullTex = () => canvasTex(1024, 256, (g, w, h) => {
  // u = tour de la coque (0 = bas), v = longueur. Bas bordeaux, haut crème.
  g.fillStyle = '#e8dbbb'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7a1b2c'; g.fillRect(0, 0, w * .2, h); g.fillRect(w * .8, 0, w * .2, h);
  g.fillStyle = '#c9963f'; g.fillRect(w * .2, 0, 6, h); g.fillRect(w * .8 - 6, 0, 6, h);
  grime(g, w, h, 140, .18, 3);
  g.strokeStyle = 'rgba(70,45,25,.45)'; g.lineWidth = 3;
  for (let k = 0; k <= 12; k++) { g.beginPath(); g.moveTo(k * w / 12, 0); g.lineTo(k * w / 12, h); g.stroke(); }
  g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.stroke();
  for (let k = 0; k <= 12; k++) for (let y = 14; y < h; y += 26) rivet(g, k * w / 12 + 8, y, 3.2);
  for (let x = 8; x < w; x += 22) rivet(g, x, 10, 3.2);
}, [1, 11]);
const floorTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2b2622'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
    const gr = g.createLinearGradient(x, y, x, y + 28); gr.addColorStop(0, '#6a5d4e'); gr.addColorStop(1, '#3b332b');
    g.fillStyle = gr; g.fillRect(x + 3, y + 3, 26, 26);
    g.fillStyle = '#1a1512'; for (let k = 0; k < 3; k++) g.fillRect(x + 7, y + 8 + k * 7, 18, 3);
  }
  grime(g, w, h, 30, .35, 9);
}, [2.6, 12]);
const woodTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9b6b3c'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) { g.fillStyle = y % 128 ? '#8a5d33' : '#a8773f'; g.fillRect(0, y, w, 60); g.fillStyle = '#4a2f18'; g.fillRect(0, y + 60, w, 4); }
  g.strokeStyle = 'rgba(70,40,20,.35)'; for (let i = 0; i < 40; i++) { const y = Math.random() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 160, y - 6, 256, y + 3); g.stroke(); }
  g.fillStyle = '#6d1526'; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.fillText('PORT-COCHON', 128, 140);
});

// ---------------------------------------------------------------- construction
export function buildSub(envMap) {
  const root = new THREE.Group();
  const M = {
    hull: new THREE.MeshStandardMaterial({ map: hullTex(), roughness: .7, metalness: .1, side: THREE.BackSide }),
    paint: new THREE.MeshStandardMaterial({ color: 0x7a1b2c, roughness: .6, metalness: .15 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xe8dbbb, roughness: .7 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex(), roughness: .85, metalness: .4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc99a48, roughness: .38, metalness: 1, envMap, envMapIntensity: .8 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc77a4a, roughness: .35, metalness: 1, envMap }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: .55, metalness: .8, envMap }),
    leather: new THREE.MeshStandardMaterial({ color: 0x8e2438, roughness: .45, metalness: 0 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: .9 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: .8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: .02, metalness: 0, transparent: true, opacity: .07, envMap, envMapIntensity: .6, depthWrite: false, side: THREE.DoubleSide }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    redLamp: new THREE.MeshBasicMaterial({ color: 0x401010 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9c9d98, roughness: .35, metalness: .9, envMap }),
    pink: new THREE.MeshStandardMaterial({ color: 0xf4a8ba, roughness: .55 }),
    beer: new THREE.MeshStandardMaterial({ color: 0xe08a1c, roughness: .15, emissive: 0x3a1800, transparent: true, opacity: .92 }),
    foam: new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: .9 }),
  };
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = root) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1, r2, h, s = 16, open = false) => new THREE.CylinderGeometry(r1, r2, h, s, 1, open);

  // coque, poupe, dôme vitré
  const L = Z_STERN - Z_DOME;
  const hullG = cyl(R, R, L, 40, true); hullG.rotateX(Math.PI / 2);
  add(hullG, M.hull, 0, 0, (Z_DOME + Z_STERN) / 2);
  const stern = new THREE.SphereGeometry(R, 32, 12, 0, TAU, 0, Math.PI / 2); stern.rotateX(Math.PI / 2);
  add(stern, M.hull, 0, 0, Z_STERN);
  const dome = new THREE.SphereGeometry(R * .995, 48, 20, 0, TAU, 0, Math.PI / 2); dome.rotateX(-Math.PI / 2);
  const domeM = add(dome, M.glass, 0, 0, Z_DOME); domeM.renderOrder = 10;
  add(new THREE.TorusGeometry(R - .02, .09, 10, 64), M.brass, 0, 0, Z_DOME);
  for (const a of [.62]) { const r = R * Math.cos(a); add(new THREE.TorusGeometry(r, .035, 8, 48), M.brass, 0, 0, Z_DOME - R * Math.sin(a)); }
  // plancher, membrures, tuyaux
  const fl = new THREE.PlaneGeometry(2.7, L + 1); fl.rotateX(-Math.PI / 2);
  add(fl, M.floor, 0, FLOOR, (Z_DOME + Z_STERN) / 2 + .5);
  for (let z = -4.6; z < Z_STERN; z += 1.2) add(new THREE.TorusGeometry(R - .03, .055, 8, 40), M.iron, 0, 0, z);
  for (const [x, y, r, mat] of [[.95, 1.32, .07, M.copper], [-.95, 1.32, .07, M.copper], [.62, 1.55, .045, M.brass], [-1.4, .55, .05, M.iron]]) {
    const p = cyl(r, r, L - 1.4, 10); p.rotateX(Math.PI / 2); add(p, mat, x, y, (Z_DOME + Z_STERN) / 2 + .4);
  }
  // cloisons avec porte
  for (const z of BULK) {
    const s = new THREE.Shape(); s.absarc(0, 0, R, 0, TAU);
    const hole = new THREE.Path(); hole.moveTo(-DOOR - .04, FLOOR); hole.lineTo(DOOR + .04, FLOOR); hole.lineTo(DOOR + .04, .55); hole.absarc(0, .55, DOOR + .04, 0, Math.PI); hole.lineTo(-DOOR - .04, FLOOR);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: .08, bevelEnabled: false, curveSegments: 32 }); g.translate(0, 0, -.04);
    add(g, M.paint, 0, 0, z);
    const fr = new THREE.Shape(); fr.moveTo(-DOOR - .12, FLOOR); fr.lineTo(DOOR + .12, FLOOR); fr.lineTo(DOOR + .12, .55); fr.absarc(0, .55, DOOR + .12, 0, Math.PI); fr.lineTo(-DOOR - .12, FLOOR);
    fr.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(fr, { depth: .16, bevelEnabled: false, curveSegments: 24 }); fg.translate(0, 0, -.08);
    add(fg, M.brass, 0, 0, z);
    // porte étanche ouverte, rabattue sur le côté
    const dg = new THREE.Shape(); dg.moveTo(-DOOR, FLOOR + .02); dg.lineTo(DOOR, FLOOR + .02); dg.lineTo(DOOR, .55); dg.absarc(0, .55, DOOR, 0, Math.PI); dg.lineTo(-DOOR, FLOOR + .02);
    const dgeo = new THREE.ExtrudeGeometry(dg, { depth: .06, bevelEnabled: false }); dgeo.translate(DOOR, 0, 0);
    const door = add(dgeo, M.paint, -DOOR - .12, 0, z + .12, 0, -1.75, 0);
    add(new THREE.TorusGeometry(.14, .025, 6, 16), M.brass, DOOR, .1, .07, 0, 0, 0, door);
  }
  // lampes (une par pièce) : ampoule, cage, et la lumière
  const lights = [];
  for (const [z, col, int] of [[-3.6, 0xffc98a, 2.2], [-.4, 0xffc070, 4.2], [4.2, 0xffb868, 3.6]]) {
    const g = new THREE.Group(); g.position.set(0, 1.5, z); root.add(g);
    add(new THREE.SphereGeometry(.07, 12, 8), M.bulb, 0, -.08, 0, 0, 0, 0, g);
    add(cyl(.11, .11, .2, 8, true), new THREE.MeshStandardMaterial({ color: 0x2a2622, wireframe: true }), 0, -.08, 0, 0, 0, 0, g);
    add(cyl(.13, .05, .06, 12), M.iron, 0, .04, 0, 0, 0, 0, g);
    const pl = new THREE.PointLight(col, int, 7, 1.6); pl.position.set(0, -.15, 0); g.add(pl); lights.push(pl);
  }

  // ------------------------------------------------ poste de pilotage
  const C = {};
  // fauteuil
  const seat = new THREE.Group(); seat.position.set(0, FLOOR, -4.15); root.add(seat);
  add(cyl(.08, .12, .38, 10), M.iron, 0, .19, 0, 0, 0, 0, seat);
  add(new THREE.BoxGeometry(.6, .12, .55), M.leather, 0, .44, 0, 0, 0, 0, seat);
  add(new THREE.BoxGeometry(.6, .7, .12), M.leather, 0, .82, .3, -.15, 0, 0, seat);
  add(new THREE.BoxGeometry(.36, .2, .1), M.leather, 0, 1.24, .37, -.15, 0, 0, seat);
  for (const x of [-.33, .33]) add(new THREE.BoxGeometry(.07, .06, .45), M.brass, x, .62, .02, 0, 0, 0, seat);
  // console
  add(box(2.3, .6, .7), M.paint, 0, FLOOR + .3, -5.25);
  const dashCanvas = document.createElement('canvas'); dashCanvas.width = 1024; dashCanvas.height = 300;
  const dashTex = new THREE.CanvasTexture(dashCanvas); dashTex.colorSpace = THREE.SRGBColorSpace; dashTex.anisotropy = 8;
  const dashM = new THREE.MeshStandardMaterial({ map: dashTex, emissiveMap: dashTex, emissive: 0xffffff, emissiveIntensity: .32, roughness: .5 });
  add(new THREE.PlaneGeometry(1.5, .44), dashM, 0, FLOOR + .64, -4.98, -1.12, 0, 0);
  add(box(1.58, .52, .03), M.brass, 0, FLOOR + .625, -5.0, -1.12 - Math.PI / 2 + Math.PI / 2, 0, 0).position.set(0, FLOOR + .628, -5.0);
  // sonar CRT
  const sonCanvas = document.createElement('canvas'); sonCanvas.width = sonCanvas.height = 256;
  const sonTex = new THREE.CanvasTexture(sonCanvas); sonTex.colorSpace = THREE.SRGBColorSpace;
  const crt = new THREE.Group(); crt.position.set(.82, FLOOR + .72, -4.95); crt.rotation.set(-.5, -.45, 0); crt.scale.setScalar(.8); root.add(crt);
  add(box(.4, .36, .3), M.iron, 0, 0, .05, 0, 0, 0, crt);
  add(new THREE.CircleGeometry(.15, 32), new THREE.MeshBasicMaterial({ map: sonTex }), 0, 0, .201, 0, 0, 0, crt);
  // manche
  const stick = new THREE.Group(); stick.position.set(0, FLOOR + .02, -4.68); root.add(stick);
  add(new THREE.ConeGeometry(.12, .16, 12), M.rubber, 0, .08, 0, 0, 0, 0, root).position.set(0, FLOOR + .08, -4.68);
  add(cyl(.022, .022, .5, 8), M.steel, 0, .25, 0, 0, 0, 0, stick);
  add(new THREE.CapsuleGeometry(.04, .12, 4, 10), M.leather, 0, .55, 0, 0, 0, 0, stick);
  add(new THREE.SphereGeometry(.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a30 }), 0, .63, -.02, 0, 0, 0, stick);
  C.stick = stick;
  // manette des gaz (à droite)
  add(box(.16, .34, .5), M.iron, .48, FLOOR + .5, -4.35);
  add(box(.04, .02, .42), M.brass, .48, FLOOR + .675, -4.35);
  const thr = new THREE.Group(); thr.position.set(.48, FLOOR + .66, -4.35); root.add(thr);
  add(cyl(.016, .016, .32, 8), M.steel, 0, .16, 0, 0, 0, 0, thr);
  add(new THREE.SphereGeometry(.055, 14, 10), M.leather, 0, .34, 0, 0, 0, 0, thr);
  C.thr = thr;
  // volant des ballasts (à gauche) et son tube de niveau
  const wheel = new THREE.Group(); wheel.position.set(-.5, FLOOR + .78, -4.5); wheel.rotation.y = Math.PI / 2 - .3; root.add(wheel);
  add(new THREE.TorusGeometry(.15, .018, 8, 28), M.brass, 0, 0, 0, 0, 0, 0, wheel);
  for (let k = 0; k < 3; k++) add(cyl(.01, .01, .3, 6), M.brass, 0, 0, 0, 0, 0, k * Math.PI / 3, wheel);
  add(cyl(.05, .05, .7, 12), M.iron, -.5, FLOOR + .35, -4.5);
  C.wheel = wheel;
  const tube = add(cyl(.045, .045, .5, 16, true), M.glass, -.78, FLOOR + .95, -4.62); tube.renderOrder = 9;
  const water = add(cyl(.04, .04, 1, 16), new THREE.MeshStandardMaterial({ color: 0x3aa8d8, emissive: 0x0a3a55, roughness: .1 }), -.78, FLOOR + .7, -4.62);
  C.water = water;
  // la pinte (niveau à bulle) et le cochon à ressort, sur la console
  const pint = new THREE.Group(); pint.position.set(-.72, FLOOR + .62, -5.0); root.add(pint);
  const pg = new THREE.LatheGeometry([[0, 0], [.045, 0], [.05, .005], [.055, .17], [.0555, .175]].map(p => new THREE.Vector2(p[0], p[1])), 20);
  add(pg, M.glass, 0, 0, 0, 0, 0, 0, pint).renderOrder = 9;
  const liquid = new THREE.Group(); liquid.position.y = .005; pint.add(liquid);
  add(cyl(.047, .043, .13, 16), M.beer, 0, .065, 0, 0, 0, 0, liquid);
  add(cyl(.05, .048, .025, 16), M.foam, 0, .14, 0, 0, 0, 0, liquid);
  add(new THREE.TorusGeometry(.04, .008, 6, 14, Math.PI), M.glass, .062, .09, 0, 0, 0, -Math.PI / 2, pint);
  C.liquid = liquid;
  const pig = new THREE.Group(); pig.position.set(.55, FLOOR + .62, -5.05); pig.rotation.y = -.5; root.add(pig);
  add(cyl(.07, .075, .015, 16), M.brass, 0, .007, 0, 0, 0, 0, pig);
  add(new THREE.SphereGeometry(.06, 16, 12), M.pink, 0, .07, 0, 0, 0, 0, pig).scale.set(1, .85, 1.35);
  for (const [x, z] of [[-.03, -.045], [.03, -.045], [-.03, .045], [.03, .045]]) add(cyl(.012, .012, .04, 6), M.pink, x, .025, z, 0, 0, 0, pig);
  const head = new THREE.Group(); head.position.set(0, .1, -.06); pig.add(head);
  add(new THREE.SphereGeometry(.045, 14, 10), M.pink, 0, .02, -.02, 0, 0, 0, head);
  add(cyl(.02, .022, .02, 12), M.pink, 0, .015, -.065, Math.PI / 2, 0, 0, head);
  for (const x of [-.022, .022]) {
    add(new THREE.ConeGeometry(.015, .03, 6), M.pink, x, .06, -.01, -.3, 0, x * 10, head);
    add(new THREE.SphereGeometry(.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a0d0d }), x * .7, .035, -.058, 0, 0, 0, head);
  }
  C.pigHead = head;
  // voyant rouge au-dessus du dôme
  C.alarm = add(new THREE.SphereGeometry(.045, 12, 8), M.redLamp, 0, 1.52, -5.35);

  // ------------------------------------------------ salle des machines
  const eng = new THREE.Group(); eng.position.set(.72, FLOOR, -.3); root.add(eng);
  const engPaint = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: .55, metalness: .3 });
  add(box(.75, .7, 2.8), engPaint, 0, .35, 0, 0, 0, 0, eng);
  for (let k = 0; k < 6; k++) add(box(.78, .05, .05), M.brass, 0, .2 + (k % 2) * .3, -1.2 + k * .48, 0, 0, 0, eng);
  for (const z of [-1.3, 1.3]) add(cyl(.06, .06, .9, 10), M.copper, -.25, .9, z, 0, 0, 0, eng);
  add(box(.8, .08, 2.9), M.brass, 0, .72, 0, 0, 0, 0, eng);
  const pistons = [];
  for (let k = 0; k < 4; k++) {
    add(cyl(.13, .13, .45, 14), M.steel, 0, .98, -1 + k * .66, 0, 0, 0, eng);
    pistons.push(add(cyl(.09, .09, .3, 12), M.copper, 0, 1.25, -1 + k * .66, 0, 0, 0, eng));
  }
  const fly = add(cyl(.42, .42, .1, 28), M.iron, -.43, .6, 1.05, 0, 0, Math.PI / 2, eng);
  add(box(.1, .6, .06), M.brass, 0, 0, 0, 0, 0, 0, fly).position.set(0, .06, 0);
  C.pistons = pistons; C.fly = fly;
  for (let k = 0; k < 4; k++) {                                      // batteries
    const b = add(box(.36, .5, .7), new THREE.MeshStandardMaterial({ color: k % 2 ? 0x2d4a3a : 0x30503e, roughness: .6 }), -.92, FLOOR + .25, -2.1 + k * .82);
    add(box(.2, .06, .08), M.brass, 0, .28, -.2, 0, 0, 0, b); add(box(.2, .06, .08), M.copper, 0, .28, .2, 0, 0, 0, b);
  }
  const torp = new THREE.Group(); torp.position.set(-.95, .55, -.3); root.add(torp);  // deux torpilles sur leur râtelier
  for (const y of [0, .32]) {
    const t = new THREE.CapsuleGeometry(.13, 1.8, 6, 16); t.rotateX(Math.PI / 2);
    add(t, M.paint, 0, y, 0, 0, 0, 0, torp);
    add(new THREE.SphereGeometry(.132, 16, 10, 0, TAU, 0, Math.PI / 2), M.brass, 0, y, -1.02, -Math.PI / 2, 0, 0, torp);
    for (let f = 0; f < 4; f++) add(box(.02, .14, .2), M.brass, 0, y, 1.0, 0, 0, f * Math.PI / 2, torp);
  }
  for (const z of [-1, .5]) add(box(.4, .04, .08), M.iron, 0, -.15, z, 0, 0, 0, torp);
  // panneau de manomètres sur la cloison
  add(box(.5, .4, .04), M.iron, -.55, .45, -2.72);
  for (const [x, y] of [[-.66, .5], [-.44, .5], [-.55, .36]]) { add(cyl(.06, .06, .03, 20), M.brass, x, y, -2.69, Math.PI / 2, 0, 0); add(new THREE.CircleGeometry(.05, 20), M.cream, x, y, -2.674); }

  // ------------------------------------------------ soute
  const rng = mulberry(42);
  for (const [x, y, z, s] of [[.75, .3, 3.2, .6], [.75, .3, 3.9, .6], [.78, .9, 3.5, .55], [.72, .3, 4.75, .65], [.75, .3, 5.5, .55]]) {
    const c = add(box(s, s, s), M.wood, x, FLOOR + y, z, 0, (rng() - .5) * .3, 0);
    for (const yy of [-s / 2 + .05, s / 2 - .05]) add(box(s + .01, .04, s + .01), M.iron, 0, yy, 0, 0, 0, 0, c);
  }
  const kegG = new THREE.LatheGeometry([[0, 0], [.2, 0], [.23, .05], [.25, .3], [.23, .55], [.2, .6], [0, .6]].map(p => new THREE.Vector2(p[0], p[1])), 18);
  for (const [x, z] of [[-.85, 3.1], [-.85, 3.75], [-.85, 4.4]]) {
    const k = add(kegG, M.steel, x, FLOOR + .25, z, 0, 0, Math.PI / 2);
    add(cyl(.252, .252, .1, 18, true), M.paint, 0, .3, 0, 0, 0, 0, k);
  }
  // échelle vers le sas
  for (const x of [-.22, .22]) add(cyl(.025, .025, 2.6, 8), M.brass, x, .25, 6.05);
  for (let y = -.8; y < 1.5; y += .3) add(cyl(.018, .018, .44, 6), M.brass, 0, y, 6.05, 0, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(.42, .06, 8, 28), M.brass, 0, 1.7, 6.05, Math.PI / 2, 0, 0);

  // ------------------------------------------------ collisions (boîtes x/z, en local)
  const boxes = [
    [-1.2, 1.2, -9, -4.82],            // console
    [-.42, .42, -4.55, -3.78],          // fauteuil
    [.38, .62, -4.62, -4.08],          // manette des gaz
    [-.62, -.38, -4.62, -4.38],         // volant
    [.3, 1.2, -1.75, 1.2],             // moteur
    [-1.2, -.72, -2.5, 1.2],           // batteries
    [.4, 1.2, 2.85, 5.9],              // caisses
    [-1.2, -.58, 2.85, 4.75],          // fûts
    [-1.2, 1.2, 5.85, 9],              // échelle et poupe
  ];
  function collide(p, r = .22) {
    p.x = clamp(p.x, -1.08 + r, 1.08 - r);
    for (const z of BULK) if (Math.abs(p.z - z) < .06 + r && Math.abs(p.x) > DOOR - r * .5) p.z = p.z < z ? z - .06 - r : z + .06 + r;
    for (const [x0, x1, z0, z1] of boxes) {
      if (p.x > x0 - r && p.x < x1 + r && p.z > z0 - r && p.z < z1 + r) {
        const dx0 = p.x - (x0 - r), dx1 = x1 + r - p.x, dz0 = p.z - (z0 - r), dz1 = z1 + r - p.z, m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) p.x = x0 - r; else if (m === dx1) p.x = x1 + r; else if (m === dz0) p.z = z0 - r; else p.z = z1 + r;
      }
    }
    return p;
  }

  return {
    root, M, C, lights, dashCanvas, dashTex, sonCanvas, sonTex, collide,
    seatPos: new THREE.Vector3(0, FLOOR, -4.15), seatEye: new THREE.Vector3(0, FLOOR + 1.12, -4.2),
    spawn: new THREE.Vector3(0, FLOOR, .4),
  };
}

// ---------------------------------------------------------------- cadrans du tableau de bord
function dial(g, cx, cy, r, v, label, red, ticks = 5) {
  g.save(); g.translate(cx, cy);
  let gr = g.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r * 1.12);
  gr.addColorStop(0, '#fbe7b0'); gr.addColorStop(.5, '#c9963f'); gr.addColorStop(1, '#5a3b17');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 1.12, 0, TAU); g.fill();
  gr = g.createRadialGradient(0, -r * .2, 0, 0, 0, r); gr.addColorStop(0, '#fbf3df'); gr.addColorStop(1, '#e0cc9e');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  const A0 = -Math.PI * .75, A1 = Math.PI * .75, ang = t => A0 + t * (A1 - A0) - Math.PI / 2;
  if (red) { g.strokeStyle = '#c8242f'; g.lineWidth = r * .12; g.beginPath(); g.arc(0, 0, r * .8, ang(red[0]), ang(red[1])); g.stroke(); }
  g.strokeStyle = '#5b1020';
  for (let i = 0; i <= ticks * 2; i++) { const a = ang(i / (ticks * 2)), mj = i % 2 === 0; g.lineWidth = mj ? r * .05 : r * .025; g.beginPath(); g.moveTo(Math.cos(a) * r * (mj ? .66 : .74), Math.sin(a) * r * (mj ? .66 : .74)); g.lineTo(Math.cos(a) * r * .88, Math.sin(a) * r * .88); g.stroke(); }
  g.fillStyle = '#5b1020'; g.font = `700 ${r * .26}px "Barlow Condensed",sans-serif`; g.textAlign = 'center'; g.fillText(label, 0, r * .52);
  const a = ang(clamp(v, 0, 1.02)); g.strokeStyle = '#1f1611'; g.lineWidth = r * .07; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-Math.cos(a) * r * .12, -Math.sin(a) * r * .12); g.lineTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); g.stroke();
  g.fillStyle = '#c9963f'; g.beginPath(); g.arc(0, 0, r * .1, 0, TAU); g.fill();
  g.restore();
}
export function drawDash(sub, s) {
  const g = sub.dashCanvas.getContext('2d'), W = 1024, H = 300;
  g.fillStyle = '#3d0c16'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 1, H);
  const d = s.depth;
  dial(g, 150, 150, 112, d / s.rated / 1.5, 'Profondeur', [1 / 1.5, 1], 6);
  g.fillStyle = '#120a06'; g.fillRect(95, 235, 110, 40); g.fillStyle = '#f3e8d0'; g.font = '700 34px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.fillText(Math.round(d) + ' m', 150, 267);
  dial(g, 405, 160, 95, s.hull / 100, 'Coque', [0, .3]);
  dial(g, 640, 160, 95, s.batt / 100, 'Batterie', [0, .2]);
  dial(g, 875, 160, 95, s.o2 / 100, 'Oxygène', [0, .2]);
  sub.dashTex.needsUpdate = true;
}
export function drawSonar(sub, contacts, sweep, range, knots = 0, heading = 0) {
  const g = sub.sonCanvas.getContext('2d'), W = 256, r = 128;
  g.fillStyle = '#03170e'; g.fillRect(0, 0, W, W);
  g.strokeStyle = 'rgba(141,255,182,.25)'; g.lineWidth = 2;
  for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(r, r, r * k / 3.2, 0, TAU); g.stroke(); }
  g.strokeStyle = 'rgba(190,255,215,.9)'; g.beginPath(); g.moveTo(r, r); g.lineTo(r + Math.sin(sweep) * r, r - Math.cos(sweep) * r); g.stroke();
  for (const c of contacts) {
    const age = ((sweep - c[0]) % TAU + TAU) % TAU / TAU, al = (1 - age) * c[2];
    g.fillStyle = `rgba(141,255,182,${al})`; g.fillRect(r + Math.sin(c[0]) * c[1] * r * .94 - 3, r - Math.cos(c[0]) * c[1] * r * .94 - 3, 6, 6);
  }
  g.fillStyle = '#ffe27a'; g.beginPath(); g.moveTo(r, r - 10); g.lineTo(r - 7, r + 7); g.lineTo(r + 7, r + 7); g.fill();
  g.fillStyle = 'rgba(141,255,182,.8)'; g.font = '700 22px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.fillText(range + ' m', r, W - 18);
  g.textAlign = 'left'; g.fillText(knots.toFixed(1).replace('.', ',') + ' nd', 14, 28); g.textAlign = 'right'; g.fillText(String(Math.round(heading)).padStart(3, '0') + '°', W - 14, 28);
  sub.sonTex.needsUpdate = true;
}
