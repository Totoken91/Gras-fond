// L'intérieur de La Truffe : poste de pilotage, salle des machines, soute.
// Repère local : l'avant est vers -z, le plancher est à y = -1.05, la coque fait 1,75 m de rayon intérieur.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TAU, clamp, damp } from './noise.js';
import { hullMaps, treadMaps, leatherMaps, woodMaps, brushedMaps, hammerMaps, dialFace, plateTex, hullAlpha, gratingMaps, posterAmbree, noticeTex, stencilTex } from './textures.js';

export const FLOOR = -1.05;
export const EYE = 1.2;                 // un citoyen Porko fait 1,30 m
const R = 1.75, Z_DOME = -5.6, Z_STERN = 6.4, BULK = [-2.8, 2.2], DOOR = .4, DOOR_TOP = .55;

// ---------------------------------------------------------------- outils de modelage
const V2 = (x, y) => new THREE.Vector2(x, y);
const rbox = (w, h, d, r = .02, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001));
const cyl = (r1, r2, h, s = 20, open = false) => new THREE.CylinderGeometry(r1, r2, h, s, 1, open);
const sph = (r, a = 18, b = 12) => new THREE.SphereGeometry(r, a, b);
const tor = (r, t, a = 10, b = 32, arc = TAU) => new THREE.TorusGeometry(r, t, a, b, arc);
function mk(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
function grp(parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); parent.add(g); return g; }
function doorShape(w, top, bottom, pad = 0) {
  const s = new THREE.Path(); s.moveTo(-w - pad, bottom); s.lineTo(w + pad, bottom); s.lineTo(w + pad, top); s.absarc(0, top, w + pad, 0, Math.PI); s.lineTo(-w - pad, bottom); return s;
}

export function buildSub(envMap) {
  const root = new THREE.Group();
  const T = { hull: hullMaps(), tread: treadMaps(), leather: leatherMaps(), wood: woodMaps(), brush: brushedMaps(), green: hammerMaps('#2c4638'), red: hammerMaps('#6a1626'), cream: hammerMaps('#d9c9a2') };
  for (const k of ['map', 'normalMap', 'roughnessMap']) T.hull[k].repeat.set(1, 10);
  T.tread.map.repeat.set(3, 36); T.tread.normalMap.repeat.set(3, 36);
  const std = o => new THREE.MeshStandardMaterial(Object.assign({ envMap, envMapIntensity: .4 }, o));
  const M = {
    hull: std({ ...T.hull, metalness: .25, side: THREE.BackSide, normalScale: new THREE.Vector2(.8, .8) }),
    floor: std({ ...T.tread, metalness: .75, roughness: .55 }),
    brass: std({ color: 0xc99a48, metalness: 1, roughness: .32, roughnessMap: T.brush.roughnessMap }),
    brassDark: std({ color: 0x8a6428, metalness: 1, roughness: .45 }),
    copper: std({ color: 0xc0704a, metalness: 1, roughness: .34 }),
    steel: std({ color: 0xa7a8a2, metalness: 1, roughness: .32, roughnessMap: T.brush.roughnessMap }),
    iron: std({ color: 0x3b3834, metalness: .85, roughness: .5 }),
    green: std({ ...T.green, metalness: .35, roughness: .45, normalScale: new THREE.Vector2(.5, .5) }),
    red: std({ ...T.red, metalness: .3, roughness: .42, normalScale: new THREE.Vector2(.5, .5) }),
    creamPaint: std({ ...T.cream, metalness: .2, roughness: .5, normalScale: new THREE.Vector2(.25, .25) }),
    leather: std({ ...T.leather, roughness: .42, metalness: 0, envMapIntensity: .3 }),
    rubber: std({ color: 0x1b1918, roughness: .85, metalness: 0 }),
    wood: std({ ...T.wood, roughness: .8, metalness: 0, envMapIntensity: .2 }),
    glass: std({ color: 0xcfefff, roughness: .02, metalness: 0, transparent: true, opacity: .1, envMapIntensity: 1.1, depthWrite: false, side: THREE.DoubleSide }),
    gaugeGlass: std({ color: 0xffffff, roughness: .05, metalness: 0, transparent: true, opacity: .06, envMapIntensity: .25, depthWrite: false }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    black: std({ color: 0x141210, roughness: .6, metalness: .2 }),
    pink: std({ color: 0xf4a8ba, roughness: .5, metalness: 0, envMapIntensity: .2 }),
    beer: std({ color: 0xe08a1c, roughness: .1, emissive: 0x4a2200, transparent: true, opacity: .93 }),
    foam: std({ color: 0xfff4dc, roughness: .9 }),
    cable: [0x7a1b2c, 0x1d1d1d, 0xc9a23a, 0x2a4a7a].map(c => std({ color: c, roughness: .6, metalness: 0 })),
  };
  const C = { needles: {}, lamps: {}, toggles: [] };
  const lights = [];
  const GLOW = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,230,190,.5)'); gr.addColorStop(1, 'rgba(255,200,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

  // ---------------------------------------------------------------- coque, membrures, dôme
  const L = Z_STERN - Z_DOME, midZ = (Z_DOME + Z_STERN) / 2;
  // hublots latéraux : [côté (+1 = tribord), z, hauteur]
  const PORTS = [[1, -2.25, .5], [-1, -2.25, .5], [1, 3.4, .45], [1, 5.0, .45], [-1, 3.55, .5]], PR = .21;
  const portAng = (side, y) => { const th = Math.acos(clamp(-y / R, -1, 1)); return side > 0 ? th : TAU - th; };
  M.hull.alphaMap = hullAlpha(PORTS.map(([sd, z, y]) => [portAng(sd, y) / TAU, (z - Z_DOME) / L, PR / (TAU * R), PR / L])); M.hull.alphaTest = .5;
  const hullG = cyl(R, R, L, 96, true); hullG.rotateX(Math.PI / 2); mk(hullG, M.hull, root, 0, 0, midZ);
  for (const [sd, z, y] of PORTS) {
    const th = portAng(sd, y), x = R * Math.sin(th), g = grp(root, x, y, z); g.lookAt(0, y, z); g.rotateY(Math.PI);
    mk(cyl(PR + .01, PR + .01, .16, 32, true), M.brassDark, g, 0, 0, .04, Math.PI / 2);
    mk(tor(PR + .03, .045, 12, 40), M.brass, g, 0, 0, -.04);
    mk(tor(PR + .005, .02, 8, 40), M.brassDark, g, 0, 0, .1);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; mk(cyl(.014, .014, .025, 6), M.steel, g, Math.cos(a) * (PR + .07), Math.sin(a) * (PR + .07), -.06, Math.PI / 2); }
    mk(new THREE.CircleGeometry(PR + .01, 32), M.glass, g, 0, 0, .1).renderOrder = 10;
  }
  const stern = new THREE.SphereGeometry(R, 48, 16, 0, TAU, 0, Math.PI / 2); stern.rotateX(Math.PI / 2); mk(stern, std({ ...T.red, metalness: .3, roughness: .45, side: THREE.BackSide }), root, 0, 0, Z_STERN);
  const frameProfile = [V2(R + .01, -.045), V2(R - .07, -.045), V2(R - .07, -.012), V2(R - .14, -.012), V2(R - .14, -.032), V2(R - .155, -.032), V2(R - .155, .032), V2(R - .14, .032), V2(R - .14, .012), V2(R - .07, .012), V2(R - .07, .045), V2(R + .01, .045)];
  const frameG = new THREE.LatheGeometry(frameProfile, 64); frameG.rotateX(Math.PI / 2);
  for (let z = -4.8; z < Z_STERN - .3; z += 1.2) if (Math.abs(z - BULK[0]) > .3 && Math.abs(z - BULK[1]) > .3) mk(frameG, M.iron, root, 0, 0, z);
  // dôme vitré et son cadre boulonné
  const domeG = new THREE.SphereGeometry(R * .995, 64, 24, 0, TAU, 0, Math.PI / 2); domeG.rotateX(-Math.PI / 2);
  mk(domeG, M.glass, root, 0, 0, Z_DOME).renderOrder = 10;
  mk(tor(R - .02, .11, 16, 96), M.brass, root, 0, 0, Z_DOME);
  mk(tor(R - .13, .035, 10, 96), M.brassDark, root, 0, 0, Z_DOME - .05);
  const boltG = cyl(.022, .022, .03, 6);
  for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; mk(boltG, M.steel, root, Math.cos(a) * (R - .13), Math.sin(a) * (R - .13), Z_DOME + .09, Math.PI / 2); }
  // plancher : tôle larmée + plinthes
  for (const sx of [-1, 1]) { const fg = new THREE.PlaneGeometry(.85, L + 1.6); fg.rotateX(-Math.PI / 2); mk(fg, M.floor, root, sx * .875, FLOOR, midZ + .6); }
  const GR = gratingMaps(); for (const k of ['map', 'alphaMap', 'normalMap']) GR[k].repeat.set(3, 40);
  const grat = new THREE.PlaneGeometry(.9, L + 1.6); grat.rotateX(-Math.PI / 2);
  mk(grat, std({ ...GR, alphaTest: .5, metalness: .8, roughness: .45, side: THREE.DoubleSide }), root, 0, FLOOR, midZ + .6);
  for (const sx of [-1, 1]) mk(rbox(.05, .05, L + .2, .01), M.iron, root, sx * .45, FLOOR - .025, midZ + .3);
  // fond de cale sous le caillebotis : tôle mouillée, tuyaux, un peu d'eau qui brille
  const bilge = new THREE.PlaneGeometry(1.4, L); bilge.rotateX(-Math.PI / 2);
  mk(bilge, std({ color: 0x1c2224, roughness: .12, metalness: .6, envMapIntensity: .9 }), root, 0, FLOOR - .34, midZ);
  for (const [x, r, mat] of [[-.25, .06, M.copper], [.2, .045, M.green], [.05, .03, M.steel]]) { const pg = cyl(r, r, L - .4, 14); pg.rotateX(Math.PI / 2); mk(pg, mat, root, x, FLOOR - .3 + r, midZ); }
  for (const x of [-.55, .55]) { const st = new THREE.PlaneGeometry(.025, L - .6); st.rotateX(-Math.PI / 2); mk(st, new THREE.MeshBasicMaterial({ color: 0x2a9a90 }), root, x * .7, FLOOR - .33, midZ); }
  for (const sx of [-1, 1]) mk(rbox(.06, .14, L + .4, .02), M.brass, root, sx * 1.3, FLOOR + .07, midZ + .3);
  // plafond : chemin de câbles, tuyaux à brides, vannes
  const tray = grp(root, 0, 1.5, midZ - .2);
  mk(rbox(.5, .04, L - 1.2, .01), M.iron, tray, 0, .05, 0);
  for (const sx of [-1, 1]) mk(rbox(.03, .1, L - 1.2, .01), M.iron, tray, sx * .25, 0, 0);
  for (let i = 0; i < 4; i++) { const c = cyl(.022, .022, L - 1.3, 10); c.rotateX(Math.PI / 2); mk(c, M.cable[i], tray, -.15 + i * .1, 0, 0); }
  const pipeRun = (x, y, r, mat) => {
    const p = cyl(r, r, L - .9, 18); p.rotateX(Math.PI / 2); mk(p, mat, root, x, y, midZ);
    for (let z = Z_DOME + 1.0; z < Z_STERN - .6; z += 1.2) { mk(tor(r + .012, .014, 8, 24), M.brassDark, root, x, y, z); mk(cyl(r + .025, r + .025, .035, 18), mat, root, x, y, z, Math.PI / 2); }
    for (let z = Z_DOME + 1.8; z < Z_STERN - .6; z += 2.8) { mk(cyl(.012, .012, .1, 8), M.steel, root, x, y - r - .05, z); const w = grp(root, x, y - r - .1, z, Math.PI / 2); mk(tor(.06, .009, 6, 18), M.red, w); for (let k = 0; k < 3; k++) mk(cyl(.006, .006, .12, 5), M.red, w, 0, 0, 0, 0, 0, k * Math.PI / 3); }
  };
  pipeRun(.95, 1.25, .065, M.copper); pipeRun(-.95, 1.25, .065, M.copper); pipeRun(1.28, .7, .045, M.steel); pipeRun(-1.32, .45, .05, M.green);
  // lampes en cage (une par pièce)
  const lamp = (z, col, inten) => {
    const g = grp(root, 0, 1.46, z);
    mk(cyl(.12, .14, .05, 24), M.iron, g); mk(cyl(.04, .05, .06, 12), M.brass, g, 0, -.05, 0);
    mk(sph(.065, 16, 12), M.bulb, g, 0, -.14, 0);
    mk(tor(.105, .008, 6, 24), M.iron, g, 0, -.2, 0, Math.PI / 2);
    for (let k = 0; k < 4; k++) { const a = grp(g, 0, -.1, 0, 0, k * Math.PI / 2, 0); mk(tor(.105, .007, 6, 16, Math.PI / 2), M.iron, a, 0, 0, 0, 0, 0, -Math.PI / 2); }
    const sp = new THREE.SpotLight(col, inten * 2.2, 9, 1.25, .85, 1.4); sp.position.set(0, -.2, 0); sp.target.position.set(0, -3, 0); g.add(sp, sp.target);
    sp.castShadow = true; sp.shadow.mapSize.set(512, 512); sp.shadow.bias = -.0015; sp.shadow.normalBias = .02; sp.shadow.camera.near = .1; sp.shadow.camera.far = 6; sp.shadow.autoUpdate = false; sp.shadow.needsUpdate = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .55 })); glow.scale.setScalar(.5); glow.position.y = -.14; g.add(glow);
    lights.push(sp); return g;
  };
  lamp(-3.55, 0xffcf96, 3); lamp(-.3, 0xffc27a, 6); lamp(4.2, 0xffbb70, 5);

  // ---------------------------------------------------------------- cloisons étanches
  for (const z of BULK) {
    const s = new THREE.Shape(); s.absarc(0, 0, R + .02, 0, TAU); s.holes.push(doorShape(DOOR, DOOR_TOP, FLOOR - .01, .03));
    const bg = new THREE.ExtrudeGeometry(s, { depth: .06, bevelEnabled: false, curveSegments: 48 }); bg.translate(0, 0, -.03);
    mk(bg, M.red, root, 0, 0, z);
    const fr = new THREE.Shape(), wi = DOOR + .03, wo = DOOR + .14;
    fr.moveTo(-wo, FLOOR); fr.lineTo(-wi, FLOOR); fr.lineTo(-wi, DOOR_TOP); fr.absarc(0, DOOR_TOP, wi, Math.PI, 0, true); fr.lineTo(wi, FLOOR); fr.lineTo(wo, FLOOR); fr.lineTo(wo, DOOR_TOP); fr.absarc(0, DOOR_TOP, wo, 0, Math.PI, false); fr.lineTo(-wo, FLOOR);
    const fg = new THREE.ExtrudeGeometry(fr, { depth: .14, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2, curveSegments: 32 }); fg.translate(0, 0, -.07);
    mk(fg, M.brass, root, 0, 0, z);
    for (let k = 0; k < 7; k++) { const a = Math.PI * k / 6, x = Math.cos(a) * (DOOR + .09), y = DOOR_TOP + Math.sin(a) * (DOOR + .09); for (const sz of [-1, 1]) mk(rbox(.05, .05, .04, .01), M.steel, root, x, y, z + sz * .095); }
    mk(rbox(DOOR * 2 + .1, .1, .22, .02), M.brassDark, root, 0, FLOOR + .05, z);
    // porte ouverte, rabattue contre la cloison, avec son volant
    const dg = new THREE.Shape(); dg.moveTo(-DOOR, FLOOR + .1); dg.lineTo(DOOR, FLOOR + .1); dg.lineTo(DOOR, DOOR_TOP); dg.absarc(0, DOOR_TOP, DOOR, 0, Math.PI); dg.lineTo(-DOOR, FLOOR + .1);
    const dgeo = new THREE.ExtrudeGeometry(dg, { depth: .07, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2 }); dgeo.translate(DOOR, 0, 0);
    const door = grp(root, -DOOR - .16, 0, z + .1, 0, -1.62, 0);
    mk(dgeo, M.red, door);
    const wh = grp(door, DOOR, .15, .1);
    mk(tor(.13, .015, 8, 28), M.brass, wh); mk(cyl(.025, .025, .06, 12), M.brass, wh, 0, 0, -.02, Math.PI / 2);
    for (let k = 0; k < 3; k++) mk(cyl(.008, .008, .26, 6), M.brass, wh, 0, 0, 0, 0, 0, k * Math.PI / 3);
    for (const y of [FLOOR + .35, DOOR_TOP - .05]) mk(cyl(.035, .035, .14, 12), M.steel, root, -DOOR - .16, y, z + .1);
  }

  // ---------------------------------------------------------------- instruments
  const gauge = (parent, x, y, z, r, opts, key) => {
    const g = grp(parent, x, y, z);
    mk(cyl(r * 1.16, r * 1.2, .05, 32), M.brass, g, 0, 0, -.01, Math.PI / 2);
    mk(tor(r * 1.08, r * .1, 12, 40), M.brass, g, 0, 0, .018);
    const face = dialFace(opts);
    mk(new THREE.CircleGeometry(r, 40), std({ map: face, emissiveMap: face, emissive: 0xfff0d8, emissiveIntensity: .07, roughness: .7, metalness: 0 }), g, 0, 0, .017);
    const n = grp(g, 0, 0, .024);
    const ng = new THREE.Shape(); ng.moveTo(-r * .03, -r * .18); ng.lineTo(r * .03, -r * .18); ng.lineTo(r * .008, r * .82); ng.lineTo(-r * .008, r * .82); ng.lineTo(-r * .03, -r * .18);
    mk(new THREE.ShapeGeometry(ng), new THREE.MeshBasicMaterial({ color: 0x1a1210 }), n);
    mk(sph(r * .07, 10, 8), M.brass, n, 0, 0, .004);
    const gl = new THREE.SphereGeometry(r * 1.02, 32, 8, 0, TAU, 0, Math.PI / 2); gl.rotateX(Math.PI / 2); gl.scale(1, 1, .22);
    mk(gl, M.gaugeGlass, g, 0, 0, .02).renderOrder = 11;
    if (key) C.needles[key] = n;
    return g;
  };
  const toggle = (parent, x, y, z, on) => {
    const g = grp(parent, x, y, z);
    mk(rbox(.045, .07, .015, .005), M.brassDark, g); mk(cyl(.012, .012, .012, 12), M.iron, g, 0, 0, .012, Math.PI / 2);
    const lev = grp(g, 0, 0, .015); mk(cyl(.006, .004, .055, 8), M.iron, lev, 0, .027, 0); mk(sph(.01, 8, 6), M.black, lev, 0, .055, 0);
    lev.rotation.x = on ? .5 : -.5; C.toggles.push(lev); return lev;
  };
  const indicator = (parent, x, y, z, color, key) => {
    mk(cyl(.026, .026, .02, 16), M.brass, parent, x, y, z, Math.PI / 2);
    const m = mk(sph(.018, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(.25) }), parent, x, y, z + .012);
    m.userData.on = new THREE.Color(color); m.userData.off = new THREE.Color(color).multiplyScalar(.18); if (key) C.lamps[key] = m; return m;
  };
  const plate = (parent, text, x, y, z, w, h, rx = 0, ry = 0) => mk(new THREE.PlaneGeometry(w, h), std({ map: plateTex(text), metalness: .8, roughness: .35 }), parent, x, y, z, rx, ry);

  // ---------------------------------------------------------------- poste de pilotage
  mk(rbox(2.5, .56, .62, .05), M.red, root, 0, FLOOR + .28, -5.27);
  mk(rbox(2.52, .04, .66, .015), M.brass, root, 0, FLOOR + .57, -5.27);
  plate(root, 'LA TRUFFE', 0, FLOOR + .3, -4.955, .5, .09);
  const panel = grp(root, 0, FLOOR + .72, -5.02, -1.05);
  mk(rbox(1.92, .56, .07, .03), M.black, panel, 0, 0, -.02);
  mk(rbox(1.98, .6, .05, .03), M.brass, panel, 0, 0, -.045);
  gauge(panel, -.62, .05, .02, .15, { label: 'Profondeur', labels: ['0', '40', '80', '120', '160', '200', '240'], red: [160 / 240, 1], ticks: 12, sub: 'mètres' }, 'depth');
  gauge(panel, -.18, .06, .02, .115, { label: 'Coque', labels: ['0', '50', '100'], red: [0, .3] }, 'hull');
  gauge(panel, .2, .06, .02, .115, { label: 'Batterie', labels: ['0', '50', '100'], red: [0, .2] }, 'batt');
  gauge(panel, .58, .06, .02, .115, { label: 'Oxygène', labels: ['0', '50', '100'], red: [0, .2] }, 'o2');
  // compteur de profondeur à rouleaux
  const ctrC = document.createElement('canvas'); ctrC.width = 256; ctrC.height = 72;
  const ctrT = new THREE.CanvasTexture(ctrC); ctrT.colorSpace = THREE.SRGBColorSpace;
  mk(rbox(.2, .065, .02, .008), M.brass, panel, -.62, -.18, .015);
  mk(new THREE.PlaneGeometry(.17, .048), new THREE.MeshBasicMaterial({ map: ctrT }), panel, -.62, -.18, .027);
  // interrupteurs et voyants
  for (let i = 0; i < 5; i++) { const lv = toggle(panel, -.28 + i * .13, -.19, .02, i !== 0); if (i === 0) C.lightsToggle = lv; }
  indicator(panel, -.82, .2, .02, 0x6dff7a, 'power'); indicator(panel, -.72, .2, .02, 0xffb43a, 'lights');
  indicator(panel, .82, .2, .02, 0xff3020, 'alarm'); indicator(panel, .72, .2, .02, 0x6ad8ff, 'surface');
  plate(panel, 'COMMANDES', .34, .23, .02, .3, .05);
  // sonar à écran cathodique, sur l'aile droite
  const sonC = document.createElement('canvas'); sonC.width = sonC.height = 256;
  const sonT = new THREE.CanvasTexture(sonC); sonT.colorSpace = THREE.SRGBColorSpace;
  const crt = grp(root, 1.02, FLOOR + .76, -4.95, -.4, -.62, 0);
  mk(rbox(.44, .4, .36, .05), M.creamPaint, crt, 0, 0, -.05);
  mk(tor(.155, .025, 10, 40), M.brass, crt, 0, .02, .135);
  mk(new THREE.CircleGeometry(.155, 40), new THREE.MeshBasicMaterial({ map: sonT }), crt, 0, .02, .128);
  const crtGl = new THREE.SphereGeometry(.16, 32, 8, 0, TAU, 0, Math.PI / 2); crtGl.rotateX(Math.PI / 2); crtGl.scale(1, 1, .25); mk(crtGl, M.gaugeGlass, crt, 0, .02, .13).renderOrder = 11;
  for (const x of [-.13, .13]) mk(cyl(.022, .022, .03, 16), M.iron, crt, x, -.15, .13, Math.PI / 2);
  const sonGlow = new THREE.PointLight(0x5dff9a, .6, 1.6, 2); sonGlow.position.set(0, 0, .35); crt.add(sonGlow);
  // fauteuil pivotant
  const seat = grp(root, 0, FLOOR, -3.95);
  for (let k = 0; k < 5; k++) { const leg = grp(seat, 0, .05, 0, 0, k / 5 * TAU, 0); mk(rbox(.05, .04, .3, .015), M.iron, leg, 0, 0, .15); mk(sph(.03, 10, 8), M.rubber, leg, 0, -.02, .3); }
  mk(cyl(.035, .045, .38, 16), M.steel, seat, 0, .24, 0); mk(cyl(.07, .07, .05, 20), M.iron, seat, 0, .43, 0);
  mk(rbox(.6, .12, .56, .05, 4), M.leather, seat, 0, .5, 0);
  const back = grp(seat, 0, .55, .28, -.14);
  mk(rbox(.58, .72, .12, .05, 4), M.leather, back, 0, .36, 0); mk(rbox(.36, .2, .1, .04, 4), M.leather, back, 0, .82, -.01);
  mk(rbox(.62, .74, .03, .02), M.brassDark, back, 0, .36, .065);
  for (const sx of [-1, 1]) { mk(rbox(.08, .07, .42, .03, 3), M.leather, seat, sx * .34, .72, .02); mk(cyl(.012, .012, .2, 8), M.brass, seat, sx * .34, .61, -.12); mk(cyl(.012, .012, .2, 8), M.brass, seat, sx * .34, .61, .16); }
  // manche à soufflet
  const bellows = []; for (let i = 0; i <= 8; i++) bellows.push(V2(i % 2 ? .07 : .095 - i * .004, i * .018));
  mk(new THREE.LatheGeometry(bellows, 20), M.rubber, root, 0, FLOOR + .03, -4.5);
  mk(cyl(.12, .14, .03, 24), M.brassDark, root, 0, FLOOR + .015, -4.5);
  const stick = grp(root, 0, FLOOR + .12, -4.5);
  mk(cyl(.018, .022, .42, 12), M.steel, stick, 0, .21, 0);
  mk(new THREE.CapsuleGeometry(.038, .13, 6, 14), M.leather, stick, 0, .5, 0, -.15);
  mk(sph(.024, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a }), stick, 0, .59, -.015);
  mk(rbox(.02, .05, .02, .006), M.steel, stick, 0, .47, -.04, .3);
  C.stick = stick;
  // télégraphe des machines (la manette des gaz), à droite
  const tel = grp(root, .78, FLOOR, -4.62);
  mk(cyl(.12, .15, .05, 24), M.brassDark, tel, 0, .025, 0); mk(cyl(.045, .06, .52, 20), M.brass, tel, 0, .3, 0);
  const drum = grp(tel, 0, .7, 0, 0, -.85, 0);
  mk(cyl(.17, .17, .1, 40), M.brass, drum, 0, 0, 0, Math.PI / 2);
  const tf = document.createElement('canvas'); tf.width = tf.height = 256;
  { const g = tf.getContext('2d'), r = 128; const gr = g.createRadialGradient(r, r * .8, 8, r, r, r); gr.addColorStop(0, '#fbf3df'); gr.addColorStop(1, '#d9c497'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.translate(r, r); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [t, a, c] of [['AVANT', .9, '#6d1526'], ['STOP', 0, '#1a1210'], ['ARRIÈRE', -.9, '#2a4a7a']]) { g.save(); g.rotate(-a); g.fillStyle = c; g.font = '700 22px "Barlow Condensed",Arial Narrow,sans-serif'; g.fillText(t, 0, -r * .72); g.fillRect(-2, -r * .93, 4, 18); g.restore(); }
    g.fillStyle = '#5b1020'; g.font = '700 19px "Barlow Condensed",sans-serif'; g.fillText('MACHINES', 0, r * .42); }
  const tft = new THREE.CanvasTexture(tf); tft.colorSpace = THREE.SRGBColorSpace;
  mk(new THREE.CircleGeometry(.15, 40), std({ map: tft, emissiveMap: tft, emissive: 0xffffff, emissiveIntensity: .06, roughness: .7, metalness: 0 }), drum, 0, 0, .051);
  const tgl = new THREE.SphereGeometry(.152, 32, 8, 0, TAU, 0, Math.PI / 2); tgl.rotateX(Math.PI / 2); tgl.scale(1, 1, .2); mk(tgl, M.gaugeGlass, drum, 0, 0, .05).renderOrder = 11;
  const hnd = grp(drum, 0, 0, .085);
  mk(rbox(.03, .24, .02, .008), M.brass, hnd, 0, .11, 0); mk(cyl(.025, .025, .03, 16), M.brass, hnd, 0, 0, 0, Math.PI / 2);
  mk(new THREE.CapsuleGeometry(.025, .08, 4, 10), M.leather, hnd, 0, .25, .02, 0, 0, Math.PI / 2);
  C.thr = hnd;
  // tableau des ballasts, à gauche : deux volants et le tube de niveau
  const bp = grp(root, -1.05, FLOOR + .9, -4.5, 0, Math.PI / 2 - .32, 0);
  mk(rbox(.62, .62, .05, .025), M.creamPaint, bp, 0, 0, -.02); mk(rbox(.66, .66, .03, .025), M.brass, bp, 0, 0, -.045);
  const wheel = (x, col) => { const w = grp(bp, x, -.12, .07); mk(tor(.1, .014, 8, 28), col, w); mk(cyl(.022, .022, .05, 12), M.brass, w, 0, 0, -.02, Math.PI / 2); for (let k = 0; k < 3; k++) mk(cyl(.007, .007, .2, 6), col, w, 0, 0, 0, 0, 0, k * Math.PI / 3); mk(cyl(.015, .015, .09, 10), M.steel, bp, x, -.12, .025, Math.PI / 2); return w; };
  C.wheelFill = wheel(-.15, std({ color: 0x9a1e24, metalness: .3, roughness: .4 })); C.wheelVent = wheel(.15, std({ color: 0x2f6a3c, metalness: .3, roughness: .4 }));
  plate(bp, 'REMPLIR', -.15, -.27, .005, .2, .04); plate(bp, 'CHASSER', .15, -.27, .005, .2, .04);
  mk(cyl(.035, .035, .34, 20, true), M.gaugeGlass, bp, 0, .13, .06).renderOrder = 11;
  for (const y of [-.05, .31]) mk(cyl(.045, .045, .03, 20), M.brass, bp, 0, y, .06);
  C.water = mk(cyl(.03, .03, 1, 16), std({ color: 0x3aa8d8, emissive: 0x0a3a55, roughness: .1 }), bp, 0, .13, .06);
  for (let k = 0; k <= 4; k++) mk(rbox(k === 2 ? .05 : .03, .006, .004, .002), M.black, bp, -.06, -.03 + k * .32 / 4, .03);
  plate(bp, 'BALLASTS', 0, .25, .005, .24, .045);
  // tableau du plafond, au-dessus du dôme
  const ov = grp(root, 0, 1.28, -5.05, .75);
  mk(rbox(1.1, .32, .05, .02), M.creamPaint, ov); mk(rbox(1.14, .36, .03, .02), M.brass, ov, 0, 0, -.025);
  for (let i = 0; i < 6; i++) toggle(ov, -.4 + i * .16, -.05, .025, i % 3 !== 1);
  indicator(ov, -.45, .1, .025, 0x6dff7a); indicator(ov, .45, .1, .025, 0xffb43a);
  plate(ov, 'PORT-COCHON', 0, .1, .028, .36, .06);
  // micro de la radio sur son crochet, avec son fil en spirale
  const hook = grp(root, -1.2, .55, -4.7, 0, Math.PI / 2 - .3, 0);
  mk(rbox(.1, .14, .05, .015), M.black, hook, 0, -.12, .03); mk(cyl(.008, .008, .06, 6), M.steel, hook, 0, 0, .02, Math.PI / 2);
  const coil = new THREE.Curve(); coil.getPoint = (t, v = new THREE.Vector3()) => v.set(.025 * Math.cos(t * 50), -t * .6, .025 * Math.sin(t * 50) + .04);
  mk(new THREE.TubeGeometry(coil, 240, .005, 5), M.black, hook, 0, -.19, 0);
  // la pinte (niveau à bulle) et le cochon à ressort, sur l'aile gauche de la console
  const pint = grp(root, -1.1, FLOOR + .59, -5.02);
  mk(new THREE.LatheGeometry([[0, 0], [.045, 0], [.05, .005], [.055, .17], [.0555, .175]].map(p => V2(p[0], p[1])), 24), M.glass, pint).renderOrder = 9;
  const liquid = grp(pint, 0, .005, 0); mk(cyl(.047, .043, .13, 20), M.beer, liquid, 0, .065, 0); mk(cyl(.05, .048, .025, 20), M.foam, liquid, 0, .14, 0);
  mk(tor(.04, .008, 6, 14, Math.PI), M.glass, pint, .062, .09, 0, 0, 0, -Math.PI / 2);
  C.liquid = liquid;
  const pig = grp(root, -1.06, FLOOR + .59, -5.32, 0, .4, 0);
  mk(cyl(.07, .075, .015, 20), M.brass, pig, 0, .007, 0);
  mk(sph(.06, 18, 14), M.pink, pig, 0, .07, 0).scale.set(1, .85, 1.35);
  for (const [x, z] of [[-.03, -.045], [.03, -.045], [-.03, .045], [.03, .045]]) mk(cyl(.012, .012, .04, 8), M.pink, pig, x, .025, z);
  const head = grp(pig, 0, .1, -.06);
  mk(sph(.045, 16, 12), M.pink, head, 0, .02, -.02); mk(cyl(.02, .022, .02, 14), M.pink, head, 0, .015, -.065, Math.PI / 2);
  for (const x of [-.022, .022]) { mk(new THREE.ConeGeometry(.015, .03, 8), M.pink, head, x, .06, -.01, -.3, 0, x * 10); mk(sph(.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a0d0d }), head, x * .7, .035, -.058); }
  C.pigHead = head;
  const instFill = new THREE.PointLight(0xffd8a0, .5, 2.2, 2); instFill.position.set(0, FLOOR + 1.45, -4.3); root.add(instFill);

  // ---------------------------------------------------------------- salle des machines
  const eng = grp(root, .74, FLOOR, -.3);
  mk(rbox(.72, .62, 2.9, .06), M.green, eng, 0, .31, 0);
  for (let k = 0; k < 7; k++) mk(rbox(.76, .05, .06, .02), M.brassDark, eng, 0, .45, -1.35 + k * .45);
  mk(rbox(.6, .14, 2.7, .05), M.green, eng, 0, .69, 0);
  const pistons = [];
  for (let k = 0; k < 4; k++) {
    const z = -1.05 + k * .7;
    mk(cyl(.13, .15, .32, 24), M.green, eng, 0, .92, z); mk(tor(.13, .02, 8, 24), M.brass, eng, 0, 1.08, z, Math.PI / 2);
    for (let b = 0; b < 6; b++) { const a = b / 6 * TAU; mk(cyl(.012, .012, .02, 6), M.steel, eng, Math.cos(a) * .13, 1.09, z + Math.sin(a) * .13); }
    pistons.push(mk(cyl(.095, .095, .22, 20), M.steel, eng, 0, 1.12, z));
    mk(rbox(.16, .1, .3, .04), M.red, eng, -.2, .92, z);
  }
  { const ex = new THREE.CatmullRomCurve3([new THREE.Vector3(.18, .9, -1.05), new THREE.Vector3(.3, .95, -1.05), new THREE.Vector3(.3, 1.0, .4), new THREE.Vector3(.25, 1.2, 1.4), new THREE.Vector3(.2, 2.6, 1.5)]);
    mk(new THREE.TubeGeometry(ex, 64, .055, 14), M.copper, eng); for (let k = 0; k < 4; k++) mk(cyl(.035, .035, .14, 12), M.copper, eng, .24, .95, -1.05 + k * .7, 0, 0, Math.PI / 2); }
  const fly = grp(eng, -.42, .55, 1.12, 0, 0, Math.PI / 2);
  mk(tor(.36, .05, 12, 48), M.iron, fly, 0, 0, 0, Math.PI / 2); mk(cyl(.07, .07, .12, 20), M.brass, fly);
  for (let k = 0; k < 6; k++) mk(rbox(.04, .7, .03, .01), M.iron, fly, 0, 0, 0, k * Math.PI / 6, 0, 0);
  mk(rbox(.14, .06, .02, .01), M.brass, fly, 0, .3, .06);
  plate(eng, 'MOTEUR PORKO · 4 CYL.', -.37, .3, .4, .4, .07, 0, -Math.PI / 2);
  C.pistons = pistons; C.fly = fly;
  // batteries
  const rack = grp(root, -.95, FLOOR, -.65);
  for (const z of [-1.8, 1.7]) for (const x of [-.22, .22]) mk(rbox(.04, .62, .04, .01), M.iron, rack, x, .31, z);
  mk(rbox(.5, .04, 3.6, .01), M.iron, rack, 0, .6, -.05);
  for (let k = 0; k < 5; k++) { const b = grp(rack, 0, 0, -1.5 + k * .72); mk(rbox(.4, .52, .6, .03), M.green, b, 0, .27, 0);
    for (const dz of [-.18, .18]) { mk(cyl(.025, .025, .05, 12), dz < 0 ? M.copper : M.steel, b, .05, .56, dz); mk(cyl(.03, .03, .02, 12), M.black, b, -.1, .54, dz); }
    if (k < 4) mk(rbox(.04, .02, .5, .005), M.copper, b, .05, .59, .36); }
  // râtelier à torpilles, deux torpilles sanglées
  const torp = grp(root, -1.18, .78, -.35);
  for (const y of [0, .34]) {
    const tg = grp(torp, 0, y, 0);
    const body = new THREE.CapsuleGeometry(.14, 1.9, 8, 24); body.rotateX(Math.PI / 2); mk(body, M.red, tg);
    const nose = new THREE.SphereGeometry(.142, 24, 12, 0, TAU, 0, Math.PI / 2); nose.rotateX(-Math.PI / 2); mk(nose, M.brass, tg, 0, 0, -1.0);
    for (const z of [-.6, .1, .8]) mk(tor(.143, .012, 8, 32), M.brassDark, tg, 0, 0, z);
    for (let f = 0; f < 4; f++) mk(rbox(.015, .2, .18, .005), M.brass, tg, 0, 0, 1.0, 0, 0, f * Math.PI / 2);
    const prop = grp(tg, 0, 0, 1.12); for (let b = 0; b < 4; b++) mk(rbox(.012, .14, .04, .005), M.brass, prop, Math.sin(b * Math.PI / 2) * .06, Math.cos(b * Math.PI / 2) * .06, 0, .4, 0, -b * Math.PI / 2);
  }
  for (const z of [-.6, .55]) { mk(tor(.16, .012, 6, 20, Math.PI), M.iron, torp, 0, 0, z, 0, 0, Math.PI); mk(tor(.16, .012, 6, 20, Math.PI), M.iron, torp, 0, .34, z, 0, 0, Math.PI); mk(rbox(.36, .03, .06, .01), M.iron, torp, 0, -.17, z); }
  // armoire électrique sur la cloison
  const cab = grp(root, -.82, .2, -2.66);
  mk(rbox(.5, .7, .14, .02), M.creamPaint, cab); mk(rbox(.04, .14, .03, .01), M.black, cab, .16, 0, .08);
  gauge(cab, -.1, .17, .07, .07, { label: 'Volts', labels: ['0', '24', '48'], red: [.85, 1] }, 'volts');
  gauge(cab, .1, .17, .07, .07, { label: 'Ampères', labels: ['0', '50', '100'], red: [.8, 1] }, 'amps');
  for (let i = 0; i < 4; i++) toggle(cab, -.15 + i * .1, -.15, .07, true);

  // ---------------------------------------------------------------- soute
  const crateG = rbox(1, 1, 1, .02);
  for (const [x, y, z, s, ry] of [[.78, .3, 3.1, .6, .05], [.78, .3, 3.8, .6, -.08], [.8, .88, 3.45, .55, .2], [.74, .32, 4.65, .64, .03], [.78, .28, 5.42, .56, -.12]]) {
    const c = mk(crateG, M.wood, root, x, FLOOR + y, z, 0, ry, 0); c.scale.setScalar(s);
    for (const yy of [-.42, .42]) mk(rbox(1.02, .06, 1.02, .01), M.iron, c, 0, yy, 0);
  }
  { const net = grp(root, 1.36, .2, 4.2, 0, -Math.PI / 2, 0), ln = [];
    for (let i = -6; i <= 6; i++) ln.push(i * .12, -.6, 0, i * .12 + .05, .7, 0);
    for (let j = -5; j <= 5; j++) ln.push(-.75, j * .12, 0, .75, j * .12 + .03, 0);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3)); net.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8a6a40 }))); }
  const kegG = new THREE.LatheGeometry([[0, 0], [.2, 0], [.23, .04], [.25, .3], [.23, .56], [.2, .6], [0, .6]].map(p => V2(p[0], p[1])), 24);
  mk(rbox(.5, .06, 2.0, .01), M.iron, root, -.9, FLOOR + .03, 3.85);
  for (const z of [3.1, 3.8, 4.5]) { const k = mk(kegG, M.steel, root, -.6, FLOOR + .3, z, 0, 0, Math.PI / 2); mk(cyl(.252, .252, .12, 24, true), M.red, k, 0, .3, 0); mk(tor(.24, .012, 6, 24), M.brassDark, k, 0, .08, 0, Math.PI / 2); mk(tor(.24, .012, 6, 24), M.brassDark, k, 0, .52, 0, Math.PI / 2); }
  for (let i = 0; i < 2; i++) { const lk = grp(root, -1.0, FLOOR, 5.15 + i * .38); mk(rbox(.36, 1.6, .36, .02), M.creamPaint, lk, 0, .8, 0); for (let s = 0; s < 4; s++) mk(rbox(.2, .015, .01, .003), M.black, lk, .181, 1.35 + s * .03, 0, 0, Math.PI / 2); mk(rbox(.02, .1, .03, .005), M.steel, lk, .19, .9, .1); }
  for (const x of [-.22, .22]) mk(cyl(.025, .025, 2.7, 12), M.brass, root, x, .3, 6.05);
  for (let y = -.8; y < 1.5; y += .28) mk(cyl(.02, .02, .44, 10), M.brass, root, 0, y, 6.05, 0, 0, Math.PI / 2);
  { const h = grp(root, 0, 1.7, 6.05, Math.PI / 2); mk(tor(.45, .07, 12, 40), M.brass, h); mk(cyl(.4, .4, .06, 40), M.red, h, 0, 0, -.02, Math.PI / 2); const w = grp(h, 0, 0, .03); mk(tor(.16, .015, 8, 28), M.brass, w); for (let k = 0; k < 3; k++) mk(cyl(.008, .008, .3, 6), M.brass, w, 0, 0, 0, 0, 0, k * Math.PI / 3); }
  plate(root, 'SOUTE', 0, .9, BULK[1] + .07, .3, .06);
  plate(root, 'MACHINES', 0, .9, BULK[0] + .07, .36, .06);

  // ---------------------------------------------------------------- accessoires
  const paperM = t => std({ map: t, roughness: .85, metalness: 0, envMapIntensity: .1 });
  // affiche Douzi Ambrée sur la coque, côté bâbord de la salle des machines (au-dessus des batteries)
  { const g = grp(root, -1.12, .72, 1.55, 0, Math.PI / 2 + .02, .05); mk(new THREE.PlaneGeometry(.42, .56), paperM(posterAmbree()), g); for (const [x, y] of [[-.19, .26], [.19, .26], [-.19, -.26], [.19, -.26]]) mk(sph(.012, 8, 6), M.brass, g, x, y, .01); }
  // règlement de bord à côté de la porte du poste de pilotage
  { const g = grp(root, .78, .3, BULK[0] + .07); mk(rbox(.46, .3, .015, .005), M.brassDark, g, 0, 0, -.01); mk(new THREE.PlaneGeometry(.42, .26), paperM(noticeTex()), g, 0, 0, .001); }
  // bandeaux de danger
  { const s1 = mk(new THREE.PlaneGeometry(.45, .11), std({ map: stencilTex('DANGER 48 V'), roughness: .6 }), root, -.69, FLOOR + .5, -.65, 0, Math.PI / 2); s1.position.x = -.735;
    mk(new THREE.PlaneGeometry(.45, .11), std({ map: stencilTex('ATTENTION TÊTE'), roughness: .6 }), root, 0, DOOR_TOP + DOOR + .22, BULK[1] - .075, 0, Math.PI); }
  // extincteur
  { const g = grp(root, -.62, FLOOR, BULK[0] + .2); mk(new THREE.CapsuleGeometry(.07, .34, 6, 16), std({ color: 0xc81e1e, roughness: .35, metalness: .3 }), g, 0, .26, 0); mk(cyl(.025, .03, .08, 10), M.black, g, 0, .5, 0); mk(rbox(.08, .02, .03, .005), M.black, g, .03, .53, 0); mk(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(.02, .52, 0), new THREE.Vector3(.12, .5, 0), new THREE.Vector3(.08, .2, .02)), 16, .009, 6), M.black, g); }
  // bouée couronne dans la soute
  { const g = grp(root, 1.18, .55, 2.75, 0, -Math.PI / 2 + .05, 0); for (let k = 0; k < 8; k++) mk(tor(.2, .055, 10, 12, TAU / 8), std({ color: k % 2 ? 0xf3e8d0 : 0xc81e2c, roughness: .55 }), g, 0, 0, 0, 0, 0, k * TAU / 8); mk(cyl(.015, .015, .1, 6), M.steel, g, 0, .27, -.03, Math.PI / 2); }
  // saucissons qui sèchent au plafond de la soute (on ne part pas en mer sans)
  { const sauG = new THREE.CapsuleGeometry(.035, .26, 6, 12), sM = std({ color: 0x7a2a22, roughness: .7, metalness: 0 }), str = std({ color: 0xe8dcc0, roughness: .9 });
    for (let i = 0; i < 7; i++) { const g = grp(root, -.25 + (i % 4) * .17, 1.36, 3.2 + i * .28 + (i % 2) * .1, (i % 3 - 1) * .08, 0, (i % 2 - .5) * .1); mk(cyl(.003, .003, .14, 4), str, g, 0, -.07, 0); mk(sauG, sM, g, 0, -.3, 0); C.sausages = C.sausages || []; C.sausages.push(g); } }
  // carnet de bord sur la console et caisse à outils
  { const g = grp(root, -.98, FLOOR + .6, -4.98, 0, .3, 0); mk(rbox(.18, .025, .24, .006), std({ color: 0x4b0e19, roughness: .7 }), g); mk(rbox(.16, .02, .22, .004), std({ color: 0xefe2c2, roughness: .9 }), g, .008, .005, 0); }
  { const g = grp(root, .3, FLOOR, 5.55, 0, .3, 0); mk(rbox(.42, .18, .2, .02), std({ color: 0xb01e24, roughness: .4, metalness: .4 }), g, 0, .09, 0); mk(rbox(.3, .03, .03, .01), M.black, g, 0, .22, 0); for (const x of [-.13, .13]) mk(cyl(.01, .01, .05, 6), M.black, g, x, .2, 0); }
  // ventilateur à pales de laiton dans le poste de pilotage
  { const g = grp(root, .9, 1.05, -3.3, 0, -Math.PI / 2 + .5, .3); mk(rbox(.09, .12, .08, .02), M.green, g); mk(tor(.14, .006, 6, 24), M.brassDark, g, 0, 0, .09); const blades = grp(g, 0, 0, .07); for (let k = 0; k < 4; k++) mk(rbox(.05, .12, .005, .003), M.brass, blades, 0, 0, 0, .3, 0, k * Math.PI / 2).translateY(.06); C.fan = blades; }

  // ombres : tout projette et reçoit, sauf la coque et les vitres
  root.traverse(o => { if (!o.isMesh) return; o.receiveShadow = true; o.castShadow = !(o.material.transparent || o.material === M.hull || o.material.alphaTest); });

  // ---------------------------------------------------------------- collisions à pied (boîtes x/z en local)
  const boxes = [
    [-1.3, 1.3, -9, -4.93],        // console
    [-.4, .4, -4.7, -3.62],         // fauteuil et manche
    [.64, .92, -4.78, -4.46],       // télégraphe
    [-1.3, -.82, -4.85, -4.15],     // tableau des ballasts
    [.32, 1.3, -1.8, 1.35],         // moteur
    [-1.3, -.66, -2.5, 1.2],        // batteries
    [.42, 1.3, 2.75, 5.8],          // caisses
    [-1.3, -.58, 2.8, 4.9],         // fûts
    [-1.3, -.78, 4.95, 5.9],        // casiers
    [-1.3, 1.3, 5.85, 9],           // échelle et poupe
  ];
  function collide(p, r = .22) {
    p.x = clamp(p.x, -1.12 + r, 1.12 - r);
    for (const z of BULK) if (Math.abs(p.z - z) < .08 + r && Math.abs(p.x) > DOOR - r * .5) p.z = p.z < z ? z - .08 - r : z + .08 + r;
    for (const [x0, x1, z0, z1] of boxes) {
      if (p.x > x0 - r && p.x < x1 + r && p.z > z0 - r && p.z < z1 + r) {
        const a = p.x - (x0 - r), b = x1 + r - p.x, c = p.z - (z0 - r), d = z1 + r - p.z, m = Math.min(a, b, c, d);
        if (m === a) p.x = x0 - r; else if (m === b) p.x = x1 + r; else if (m === c) p.z = z0 - r; else p.z = z1 + r;
      }
    }
    return p;
  }
  return {
    root, M, C, lights, collide, sonCanvas: sonC, sonTex: sonT, ctrCanvas: ctrC, ctrTex: ctrT, instFill, sonGlow,
    seatPos: new THREE.Vector3(0, FLOOR, -3.95), seatEye: new THREE.Vector3(0, FLOOR + 1.12, -4.0), seatSpot: new THREE.Vector3(0, FLOOR, -3.4),
    spawn: new THREE.Vector3(0, FLOOR, .5), pig: { a: 0, v: 0 }, lastCtr: '',
  };
}

// ---------------------------------------------------------------- animation de l'intérieur
const needleA = v => (Math.PI * .75) - clamp(v, 0, 1.03) * Math.PI * 1.5;
export function animateSub(sub, s, dt, t) {
  const C = sub.C;
  C.stick.rotation.z = damp(C.stick.rotation.z, -s.stickX * .32, 12, dt); C.stick.rotation.x = damp(C.stick.rotation.x, s.stickY * .32, 12, dt);
  C.thr.rotation.z = damp(C.thr.rotation.z, s.thr > 0 ? s.thr * .9 : s.thr * 2.2, 9, dt);
  C.wheelFill.rotation.z += (s.fill ? 5 : 0) * dt; C.wheelVent.rotation.z -= (s.vent ? 5 : 0) * dt;
  C.water.scale.y = Math.max(.01, s.bal * .34); C.water.position.y = -.04 + s.bal * .17;
  C.liquid.rotation.set(-s.pitch, 0, -s.roll);
  const rpm = s.batt > 0 ? Math.abs(s.thr) : 0;
  C.pistons.forEach((p, i) => (p.position.y = 1.12 + Math.sin(t * (5 + rpm * 20) + i * 1.57) * .07 * (rpm > .01 ? 1 : 0)));
  C.fly.rotation.x += dt * rpm * 16;
  const pg = sub.pig; pg.v += (-(pg.a - (-s.yawRate * 40 + s.pitch * 25)) * 120 - pg.v * 5) * dt + s.kick; pg.a = clamp(pg.a + pg.v * dt, -40, 40); C.pigHead.rotation.z = pg.a * Math.PI / 180;
  // aiguilles, avec un léger tremblement
  const jit = Math.sin(t * 23) * .004 + Math.sin(t * 7) * .003;
  const set = (k, v) => { const n = C.needles[k]; if (n) n.rotation.z = damp(n.rotation.z, needleA(v) + jit, 6, dt); };
  set('depth', s.depth / 240); set('hull', s.hull / 100); set('batt', s.batt / 100); set('o2', s.o2 / 100);
  set('volts', s.batt > 0 ? .5 + s.batt / 400 : 0); set('amps', .15 + rpm * .6 + (s.lights ? .1 : 0));
  // compteur à rouleaux
  const ctr = String(Math.round(s.depth)).padStart(4, '0');
  if (ctr !== sub.lastCtr) {
    sub.lastCtr = ctr; const g = sub.ctrCanvas.getContext('2d');
    g.fillStyle = '#120b08'; g.fillRect(0, 0, 256, 72); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) { const gr = g.createLinearGradient(0, 0, 0, 72); gr.addColorStop(0, '#2a1d16'); gr.addColorStop(.5, '#f3e8d0'); gr.addColorStop(1, '#2a1d16'); g.fillStyle = gr; g.fillRect(8 + i * 50, 6, 44, 60); g.fillStyle = '#1a1210'; g.font = '700 50px "Barlow Condensed",sans-serif'; g.fillText(ctr[i], 30 + i * 50, 38); }
    g.fillStyle = '#f3e8d0'; g.font = '700 30px "Barlow Condensed",sans-serif'; g.fillText('m', 232, 40);
    sub.ctrTex.needsUpdate = true;
  }
  // voyants
  const lampSet = (k, on) => { const l = C.lamps[k]; if (l) l.material.color.copy(on ? l.userData.on : l.userData.off); };
  const crit = s.hull < 30 || s.o2 < 20 || s.batt < 15 || s.depth > s.rated;
  lampSet('power', s.batt > 0); lampSet('lights', s.lights); lampSet('alarm', crit && Math.sin(t * 9) > 0); lampSet('surface', s.depth < 1);
  if (C.lightsToggle) C.lightsToggle.rotation.x = damp(C.lightsToggle.rotation.x, s.lights ? .5 : -.5, 18, dt);
  // lampes : légère respiration, secours en rouge si la batterie est vide
  const base = [6.6, 13, 11], cols = [0xffcf96, 0xffc27a, 0xffbb70];
  sub.lights.forEach((l, i) => { l.intensity = (s.batt > 0 ? base[i] : .8) * (1 + .03 * Math.sin(t * 13 + i * 2) * Math.sin(t * 3.1 + i)); l.color.setHex(s.batt > 0 ? cols[i] : 0xff3020); });
  sub.instFill.intensity = s.batt > 0 ? .5 : 0; sub.sonGlow.intensity = s.batt > 0 ? .6 : 0;
  if (C.fan) C.fan.rotation.z += dt * (s.batt > 0 ? 14 : 0);
  if (C.sausages) C.sausages.forEach((g, i) => { g.rotation.z = -s.roll * .8 + Math.sin(t * 1.3 + i) * .04; g.rotation.x = s.pitch * .8 + Math.sin(t * 1.1 + i * 2) * .03; });
  // ombres : on ne recalcule que la lampe de la pièce où l'on se trouve, une image sur trois
  sub.shadowTick = (sub.shadowTick || 0) + 1;
  if (sub.shadowTick % 3 === 0) { const room = s.playerZ < BULK[0] ? 0 : s.playerZ < BULK[1] ? 1 : 2; sub.lights[room].shadow.needsUpdate = true; }
}

// ---------------------------------------------------------------- écran du sonar
export function drawSonar(sub, contacts, sweep, range, knots = 0, heading = 0, on = true) {
  const g = sub.sonCanvas.getContext('2d'), W = 256, r = 128;
  g.fillStyle = on ? '#03170e' : '#050807'; g.fillRect(0, 0, W, W);
  if (on) {
    g.strokeStyle = 'rgba(141,255,182,.22)'; g.lineWidth = 2;
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(r, r, r * k / 3.2, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(r, 10); g.lineTo(r, W - 10); g.moveTo(10, r); g.lineTo(W - 10, r); g.stroke();
    const gr = g.createConicGradient ? g.createConicGradient(sweep - Math.PI / 2 - .9, r, r) : null;
    if (gr) { gr.addColorStop(0, 'rgba(141,255,182,0)'); gr.addColorStop(.143, 'rgba(141,255,182,.3)'); gr.addColorStop(.144, 'rgba(141,255,182,0)'); g.fillStyle = gr; g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill(); }
    for (const c of contacts) { const age = ((sweep - c[0]) % TAU + TAU) % TAU / TAU, al = (1 - age) * c[2]; g.fillStyle = `rgba(141,255,182,${al})`; g.fillRect(r + Math.sin(c[0]) * c[1] * r * .94 - 3, r - Math.cos(c[0]) * c[1] * r * .94 - 3, 6, 6); }
    g.fillStyle = '#ffe27a'; g.beginPath(); g.moveTo(r, r - 10); g.lineTo(r - 7, r + 7); g.lineTo(r + 7, r + 7); g.fill();
    g.fillStyle = 'rgba(141,255,182,.85)'; g.font = '700 22px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.fillText(range + ' m', r, W - 22);
    g.textAlign = 'left'; g.fillText(knots.toFixed(1).replace('.', ',') + ' nd', 30, 40); g.textAlign = 'right'; g.fillText(String(Math.round(heading)).padStart(3, '0') + '°', W - 30, 40);
  }
  const v = g.createRadialGradient(r, r, r * .6, r, r, r); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = v; g.fillRect(0, 0, W, W);
  sub.sonTex.needsUpdate = true;
}
