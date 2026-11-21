// Le dehors : le fond marin au large de Port-Cochon, sa vie, sa lumière, et l'épave du Gras-Fond.
import * as THREE from 'three';
import { TAU, clamp, lerp, ss, mulberry, pick, noise2, fbm } from './noise.js';

export const SIZE = 1000;                 // la zone fait 1 km de côté
export const LIMIT = 440;                 // au-delà, le courant repousse

// ---------------------------------------------------------------- relief
const canyonX = z => 70 * Math.sin(z * .0075) + 25 * noise2(z * .01, 4.2);
export function H(x, z) {
  const s = -z + 40 * noise2(x * .004, z * .004) + 12 * noise2(x * .012 + 3, z * .012);
  let h = -18 + 12 * ss(-120, -320, s) - 42 * ss(70, 210, s) - 80 * ss(190, 380, s);
  const cliff = ss(60, 120, s) * (1 - ss(330, 420, s));
  const rg = 1 - Math.abs(noise2(x * .011 + 9, z * .011 - 4));
  h += fbm(x * .015, z * .015, 4) * (3 + 5 * ss(0, 200, s)) + rg * rg * (2 + 16 * cliff);
  if (cliff > .02) { const t = 9, q = Math.floor(h / t) * t, f = (h - q) / t; h += (q + t * ss(.25, .75, f) - h) * .6 * cliff; }
  if (s > 110) { const dx = Math.abs(x - canyonX(z)); h -= 90 * ss(110, 260, s) * (1 - ss(14, 55, dx)); }
  h += Math.sin(x * .5 + noise2(x * .03, z * .03) * 3) * .22 * (1 - ss(20, 50, -h));
  return Math.min(h, -4.5);
}
function color(h, ny, x, z, o) {
  const d = -h, v = noise2(x * .06, z * .06) * .5 + .5, v2 = noise2(x * .018 + 40, z * .018) * .5 + .5;
  let c = new THREE.Color(0xf2dcae);                                    // sable blond
  c.lerp(new THREE.Color(0x8fae56), ss(.58, .78, v2) * (1 - ss(30, 60, d)));   // herbiers
  c.lerp(new THREE.Color(0x9a92a8), ss(25, 90, d));                    // vase grise
  c.lerp(new THREE.Color(0x4c4a72), ss(90, 220, d));                   // fond violet
  if (ny < .82) c.lerp(new THREE.Color(d < 50 ? 0xa08870 : d < 130 ? 0x6e6680 : 0x463e5c), ss(.82, .58, ny));
  c.multiplyScalar(.84 + .3 * v);
  o.r = c.r; o.g = c.g; o.b = c.b;
}

// ---------------------------------------------------------------- matériaux partagés
export const U = { time: { value: 0 }, caus: { value: 0 } };
const CAUS = `float causL(vec2 p,float t){vec2 q=p+vec2(sin(p.y*.9+t)*.8,cos(p.x*.8-t*.9)*.8);float a=abs(sin(q.x+sin(q.y*1.3+t)));float b=abs(sin(q.y*1.1+sin(q.x*1.2-t*1.1)));return pow(1.-min(a,b),7.);}
float caus(vec2 w){float t=uTime*.6;return causL(w*.14,t)+causL(w*.27+7.,t*1.2)*.55;}`;
function withCaustics(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uCaus = U.caus;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying float vUp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;vUp=normalize(mat3(modelMatrix)*objectNormal).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uCaus;\nvarying vec3 vWP;\nvarying float vUp;\n' + CAUS)
      .replace('#include <opaque_fragment>', 'outgoingLight+=vec3(.55,.9,1.)*caus(vWP.xz)*uCaus*clamp(vUp*1.4-.3,0.,1.)*diffuseColor.rgb;\n#include <opaque_fragment>');
  };
  return mat;
}
function withSway(mat, amp) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
    {vec4 ip=instanceMatrix*vec4(0.,0.,0.,1.);float ph=ip.x*.37+ip.z*.29;float k=position.y*position.y;transformed.x+=sin(uTime*1.1+ph+position.y*2.4)*${amp.toFixed(2)}*k;transformed.z+=cos(uTime*.8+ph*1.3+position.y*2.)*${(amp * .6).toFixed(2)}*k;}`);
  };
  return mat;
}
function withWiggle(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPh;').replace('#include <begin_vertex>', `#include <begin_vertex>
    {float k=clamp(-transformed.z*1.3+.2,0.,1.);transformed.x+=sin(uTime*10.+aPh)*.16*k*k;}`);
  };
  return mat;
}
const glowU = { uTime: U.time, uPx: { value: 400 }, uFog: { value: .012 } };
export const glowUniforms = glowU;
const glowMat = new THREE.ShaderMaterial({
  uniforms: glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aCol;attribute float aPh;attribute float aSize;uniform float uTime;uniform float uPx;uniform float uFog;varying vec3 vC;
  void main(){vec4 mv=modelViewMatrix*vec4(position,1.);float d=max(-mv.z,.3);float p=.6+.4*sin(uTime*(.8+fract(aPh*7.31)*1.5)+aPh*6.283);vC=aCol*p*exp(-pow(uFog*d*.7,2.));gl_PointSize=clamp(aSize*uPx/d,1.,90.);gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `varying vec3 vC;void main(){vec2 c=gl_PointCoord-.5;float r=length(c);float a=smoothstep(.5,0.,r);a=a*a+smoothstep(.12,0.,r)*.9;gl_FragColor=vec4(vC*a,1.);}`,
});
export function makeGlow(list) {   // [x,y,z,hex,size,phase]*
  const n = list.length / 6, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n), ph = new Float32Array(n), col = new THREE.Color();
  for (let i = 0; i < n; i++) { p.set(list.slice(i * 6, i * 6 + 3), i * 3); col.setHex(list[i * 6 + 3]); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; s[i] = list[i * 6 + 4]; ph[i] = list[i * 6 + 5]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(s, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const o = new THREE.Points(g, glowMat); o.frustumCulled = false; return o;
}

// ---------------------------------------------------------------- géométries du décor
function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}
function merge(parts) {
  let n = 0;
  const gs = parts.map(p => { let g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); if (p.m) g.applyMatrix4(p.m); g.deleteAttribute('uv'); n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}
const G = {};
{ const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + .32 * noise2(x * 1.6 + y * .9, z * 1.6 - y * 1.3) + .1 * noise2(x * 4, z * 4 + y); p.setXYZ(i, x * k, y * k * .7, z * k); }
  g.computeVertexNormals(); G.rock = g; }
{ const a = new THREE.PlaneGeometry(1, 1, 1, 12); a.translate(0, .5, 0); const p = a.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (.25 + .75 * Math.sin(Math.min(y, .97) * Math.PI * .85 + .25))); }
  G.kelp = merge([{ g: a }, { g: a, m: M4(0, 0, 0, 0, Math.PI / 2) }]); }
{ const parts = [], cy = new THREE.CylinderGeometry(.07, .11, 1, 6, 1, true); cy.translate(0, .5, 0); const tip = new THREE.SphereGeometry(.12, 6, 4);
  const rec = (m, d) => { parts.push({ g: cy, m: m.clone() }); const t = new THREE.Vector3(0, 1, 0).applyMatrix4(m); if (!d) parts.push({ g: tip, m: M4(t.x, t.y, t.z) }); if (d > 0) for (let k = 0; k < 3; k++) rec(m.clone().multiply(M4(0, 1, 0, .5 + .18 * (k % 2), k * 2.1 + d, 0, .74)), d - 1); };
  rec(M4(0, 0, 0, 0, 0, 0, 1, .85, 1), 2); G.branch = merge(parts); }
{ const g = new THREE.SphereGeometry(1, 18, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + .07 * Math.sin(14 * Math.atan2(z, x) + 10 * y); y = y < -.15 ? -.15 + (y + .15) * .2 : y; p.setXYZ(i, x * k, (y + .15) * .75, z * k); }
  g.computeVertexNormals(); G.brain = g; }
{ const parts = []; for (let k = 0; k < 7; k++) { const a = k * 2.4, r = k ? .4 : 0, h = .7 + ((k * 37) % 10) / 10 * 1.2; const c = new THREE.CylinderGeometry(.16, .21, h, 8, 1, true); c.translate(0, h / 2, 0); parts.push({ g: c, m: M4(Math.cos(a) * r, 0, Math.sin(a) * r) }); } G.pipe = merge(parts); }
{ const f = new THREE.CircleGeometry(1, 22, 0, Math.PI), p = f.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3) * .08); f.translate(0, .1, 0); G.fan = f; }
G.sponge = new THREE.LatheGeometry([[.22, 0], [.38, .25], [.46, .8], [.4, 1.25], [.47, 1.4]].map(p => new THREE.Vector2(p[0], p[1])), 12);
{ const g = new THREE.CylinderGeometry(.04, .09, 1, 6); g.translate(0, .5, 0); G.stalk = g; }
{ const body = new THREE.SphereGeometry(.5, 10, 7); body.scale(.4, .62, 1);
  const tail = new THREE.BufferGeometry(); tail.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -.38, 0, .32, -.85, 0, -.32, -.85]), 3)); tail.computeVertexNormals();
  const fin = new THREE.BufferGeometry(); fin.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, .28, .15, 0, .5, -.15, 0, .25, -.25]), 3)); fin.computeVertexNormals();
  G.fish = merge([{ g: body }, { g: tail }, { g: fin }]); }

const PAL = {
  kelp: [0x8f9a3c, 0xb39a3a, 0x6c9440, 0xa8a24a], coral: [0xff5f9e, 0xff8a2a, 0xffd23f, 0xa55eea, 0xe8433f, 0x34e0c8, 0xff9fd0, 0x6fd36a],
  sponge: [0xf2b33e, 0xe8733a, 0xc94f4f, 0x9a6fd1, 0xe9a94a, 0xd94f8a], glow: [0x4ff0ff, 0xff4fd8, 0x6dff9a, 0x8f7bff, 0xfff06a],
};

// ---------------------------------------------------------------- construction du monde
export function buildWorld(scene) {
  const fog = new THREE.FogExp2(0x2cb6c6, .012); scene.fog = fog; scene.background = new THREE.Color(0x0a2a3a);
  const hemi = new THREE.HemisphereLight(0xaaf0ff, 0x6a6040, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.4); sun.position.set(.35, 1, .25); scene.add(sun);
  const wreckLight = new THREE.PointLight(0xff3020, 0, 40, 1.3); scene.add(wreckLight);

  // fond : une seule grande maille
  const N = 250, step = SIZE / N, pos = new Float32Array((N + 1) ** 2 * 3), nor = new Float32Array(pos.length), col = new Float32Array(pos.length), c = new THREE.Color();
  const hh = new Float32Array((N + 3) ** 2);
  for (let j = 0; j < N + 3; j++) for (let i = 0; i < N + 3; i++) hh[j * (N + 3) + i] = H(-SIZE / 2 + (i - 1) * step, -SIZE / 2 + (j - 1) * step);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * (N + 1) + i, E = N + 3, h = hh[(j + 1) * E + i + 1], x = -SIZE / 2 + i * step, z = -SIZE / 2 + j * step;
    const nx = -(hh[(j + 1) * E + i + 2] - hh[(j + 1) * E + i]), nz = -(hh[(j + 2) * E + i + 1] - hh[j * E + i + 1]), ny = 2 * step, l = Math.hypot(nx, ny, nz);
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    color(h, ny / l, x, z, c); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const idx = new Uint32Array(N * N * 6); let q = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; idx.set([a, b, a + 1, a + 1, b, b + 1], q); q += 6; }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(new THREE.BufferAttribute(idx, 1));
  const terrain = new THREE.Mesh(tg, withCaustics(new THREE.MeshLambertMaterial({ vertexColors: true }))); scene.add(terrain);

  // décor, rangé par cases de 100 m pour n'afficher que ce qui est proche
  const CELL = 100, NC = SIZE / CELL, cells = [];
  const mats = {
    rock: new THREE.MeshLambertMaterial({ flatShading: true }), kelp: withSway(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 1.5),
    deco: new THREE.MeshLambertMaterial(), ds: new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
  };
  const TYPES = { rock: [G.rock, mats.rock], kelp: [G.kelp, mats.kelp], branch: [G.branch, mats.deco], brain: [G.brain, mats.deco], pipe: [G.pipe, mats.ds], fan: [G.fan, mats.ds], sponge: [G.sponge, mats.ds], stalk: [G.stalk, mats.deco] };
  const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), cc = new THREE.Color();
  for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
    const r = mulberry(ci * 7919 + cj * 104729 + 1), x0 = -SIZE / 2 + ci * CELL, z0 = -SIZE / 2 + cj * CELL, L = {}, gl = [];
    for (const k in TYPES) L[k] = [];
    for (let n = 0; n < 900; n++) {
      const x = x0 + r() * CELL, z = z0 + r() * CELL, h = H(x, z), d = -h, rr = r();
      const forest = noise2(x * .012 + 3, z * .012 - 2), reef = noise2(x * .016 - 9, z * .016 + 4);
      if (d < 48 && forest > .2 && rr < .5) L.kelp.push([x, h - .3, z, .9 + r() * .8, Math.min(d - 2, 6 + r() * 14), r() * TAU, 0, 0, pick(PAL.kelp, r)]);
      else if (d < 45 && reef > -.1 && rr < .3) { const t = pick(['branch', 'branch', 'brain', 'pipe', 'fan'], r), s = t === 'brain' ? .6 + r() * 1.5 : .8 + r() * 2; L[t].push([x, h - .15, z, s, s, r() * TAU, (r() - .5) * .3, (r() - .5) * .3, pick(PAL.coral, r)]); }
      else if (d > 40 && d < 160 && rr < .06) { const s = .8 + r() * 2.2; L.sponge.push([x, h - .1, z, s, s * (.8 + r()), r() * TAU, 0, 0, pick(PAL.sponge, r)]); }
      else if (d > 40 && rr < .025) { const s = 2 + r() * 2.5; L.fan.push([x, h - .2, z, s, s, r() * TAU, 0, 0, pick([0xe8433f, 0xff8a2a, 0xffd23f, 0xd94f8a], r)]); }
      else if (d > 110 && rr < .05) { const ht = 1.5 + r() * 4; L.stalk.push([x, h - .1, z, 1, ht, 0, 0, 0, 0x9a8fb8]); gl.push(x, h + ht - .1, z, pick(PAL.glow, r), 1 + r() * 1.6, r() * TAU); }
      else if (rr < .035) { const s = .5 + Math.pow(r(), 3) * 4.5; L.rock.push([x, h - s * .25, z, s, s, r() * TAU, r() * .5, r() * .5, d < 50 ? pick([0xa89a84, 0x9c907c, 0xb4a690], r) : pick([0x7a6f8c, 0x8a7a7c, 0x6a5a78], r)]); }
    }
    if (-H(x0 + 50, z0 + 50) > 90) for (let n = 0; n < 24; n++) { const x = x0 + r() * CELL, z = z0 + r() * CELL; gl.push(x, H(x, z) + 3 + r() * 40, z, pick([0x4fb8ff, 0x7ef0ff, 0x9a8bff], r), .3 + r() * .5, r() * TAU); }
    const grp = new THREE.Group(); grp.userData.c = new THREE.Vector3(x0 + CELL / 2, H(x0 + 50, z0 + 50), z0 + CELL / 2);
    for (const k in L) {
      const a = L[k]; if (!a.length) continue;
      const im = new THREE.InstancedMesh(TYPES[k][0], TYPES[k][1], a.length);
      a.forEach((t, i) => { e.set(t[6], t[5], t[7]); qt.setFromEuler(e); v.set(t[0], t[1], t[2]); sc.set(t[3], t[4], t[3]); m.compose(v, qt, sc); im.setMatrixAt(i, m); im.setColorAt(i, cc.setHex(t[8])); });
      im.computeBoundingSphere(); grp.add(im);
    }
    if (gl.length) grp.add(makeGlow(gl));
    scene.add(grp); cells.push(grp);
  }

  // l'épave du Gras-Fond, au bord du canyon
  const wreck = buildWreck(scene, -20, -300, wreckLight);

  // poissons
  const NS = 7, NPS = 26, fish = new THREE.InstancedMesh(G.fish, withWiggle(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })), NS * NPS);
  fish.frustumCulled = false; fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  { const ph = new Float32Array(NS * NPS).map(() => Math.random() * TAU); G.fish.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1)); for (let i = 0; i < NS * NPS; i++) fish.setColorAt(i, cc.setHex(0xffffff)); }
  scene.add(fish);
  const SPEC = [{ max: 50, cols: [0xffd23f, 0xff8a2a, 0x3a86ff, 0xff5f9e, 0x5ee6d6, 0xffffff], sz: [.35, .65], sp: 2.4 }, { max: 9e9, cols: [0xc9d9ea, 0x9fb7d4, 0xe2eaf2, 0xd8c3a0], sz: [.45, .8], sp: 2.8 }];
  const schools = [...Array(NS)].map((_, i) => ({ i, on: false, c: new THREE.Vector3(), h: 0, sp: SPEC[0], t: Math.random() * 99, off: [...Array(NPS)].map(() => new THREE.Vector3((Math.random() - .5) * 9, (Math.random() - .5) * 3.5, (Math.random() - .5) * 9)), sc: [...Array(NPS)].map(() => Math.random()) }));

  // neige marine, rayons, surface vue d'en dessous, dôme dégradé
  const snowU = { uTime: U.time, uPx: glowU.uPx, uFog: { value: .012 }, uCam: { value: new THREE.Vector3() }, uBox: { value: 60 }, uL: { value: new THREE.Vector3() }, uLP: { value: new THREE.Vector3() }, uLOn: { value: 0 }, uAmb: { value: .3 } };
  { const n = 1800, p = new Float32Array(n * 3), ph = new Float32Array(n); for (let i = 0; i < n; i++) { p[i * 3] = Math.random() * 60; p[i * 3 + 1] = Math.random() * 60; p[i * 3 + 2] = Math.random() * 60; ph[i] = Math.random() * TAU; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const o = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: snowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aPh;uniform float uTime;uniform float uPx;uniform float uFog;uniform vec3 uCam;uniform float uBox;uniform vec3 uL;uniform vec3 uLP;uniform float uLOn;uniform float uAmb;varying float vI;
      void main(){vec3 p=position+vec3(sin(uTime*.2+aPh)*1.5,-uTime*.2,cos(uTime*.17+aPh*1.3)*1.5);p=mod(p-uCam,uBox)-uBox*.5+uCam;vec4 mv=viewMatrix*vec4(p,1.);float d=max(-mv.z,.05);
      vec3 dl=p-uLP;float cone=smoothstep(.84,.97,dot(normalize(dl),uL))*uLOn/(1.+dot(dl,dl)*.003);vI=(uAmb+cone*2.)*exp(-pow(uFog*d,2.))*smoothstep(2.,4.,d);gl_PointSize=clamp(.08*uPx/d,1.,5.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying float vI;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(c));gl_FragColor=vec4(vec3(.85,.95,1.)*a*vI,1.);}` }));
    o.frustumCulled = false; scene.add(o); }
  const rays = new THREE.Group(); scene.add(rays);
  { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, -.5, 0);
    for (let i = 0; i < 14; i++) { const mm = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uT: U.time, uP: { value: Math.random() * 10 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uA;uniform float uT;uniform float uP;varying vec2 vU;void main(){float h=sin(vU.x*3.14159);h*=h;float a=h*pow(vU.y,1.8)*uA*(.7+.3*sin(uT*.5+uP+vU.x*4.));gl_FragColor=vec4(vec3(.7,1.,.95)*a,1.);}` });
      const o = new THREE.Mesh(g, mm); o.userData = { w: 5 + Math.random() * 12, l: 50 + Math.random() * 70, init: false }; rays.add(o); } }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { uT: U.time, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() }, uFog: { value: .012 }, uFogC: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uT;uniform vec3 uCam;uniform vec3 uCol;uniform float uFog;uniform vec3 uFogC;varying vec3 vW;
    void main(){vec3 dv=vW-uCam;float d=length(dv);vec3 dir=dv/d;float r=sin(vW.x*.31+uT*1.2+sin(vW.z*.2+uT)*1.5)*sin(vW.z*.27-uT*.9+sin(vW.x*.17)*1.3);
    float sn=smoothstep(.6,.92,dir.y);vec3 col=mix(uCol*1.5,vec3(.82,.98,1.),sn)+vec3(.14,.2,.2)*r*(.35+sn);col+=vec3(1.,.95,.8)*pow(max(dot(dir,normalize(vec3(.3,1.,.2))),0.),300.)*2.5;
    gl_FragColor=vec4(mix(uFogC,col,exp(-pow(uFog*d*.8,2.))),1.);}` }));
  under.frustumCulled = false; scene.add(under);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uF: { value: new THREE.Color() }, uU: { value: new THREE.Color() }, uD: { value: new THREE.Color() }, uS: { value: 0 } },
    vertexShader: `varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 uF;uniform vec3 uU;uniform vec3 uD;uniform float uS;varying vec3 vD;void main(){float y=vD.y;vec3 c=mix(uD,uF,smoothstep(-.95,-.02,y));c=mix(c,uU,pow(smoothstep(-.08,1.,y),1.25));c+=vec3(.55,.9,1.)*uS*pow(max(dot(vD,normalize(vec3(.3,1.,.2))),0.),5.);gl_FragColor=vec4(c,1.);}` }));
  dome.renderOrder = -5; dome.frustumCulled = false; scene.add(dome);

  // phares du sous-marin (attachés à un corps invisible qui suit la coque)
  const body = new THREE.Group(); scene.add(body);
  const heads = [-1, 1].map(sx => { const s = new THREE.SpotLight(0xfff0d2, 0, 110, .42, .55, 1.3); s.position.set(sx * 1.1, -1.1, -7.6); s.target.position.set(sx * 2, -6, -40); body.add(s, s.target); return s; });
  const beam = (() => { const g = new THREE.ConeGeometry(14, 60, 24, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, -30);
    const o = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `varying float vL;void main(){vL=-position.z/60.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uI;varying float vL;void main(){gl_FragColor=vec4(vec3(1.,.93,.75)*pow(1.-vL,1.8)*smoothstep(0.,.05,vL)*uI,1.);}` }));
    o.position.set(0, -1.1, -7.6); o.rotation.x = -.12; body.add(o); return o; })();

  // ---------------------------------------------------------------- ambiance selon la profondeur
  const FOGP = [[0, 0x35c2cf], [20, 0x1d9bb8], [60, 0x0f6496], [120, 0x093d70], [200, 0x05214a], [300, 0x031235]];
  const tmp = new THREE.Color(), W = new THREE.Color(1, 1, 1);
  const palAt = (d, out) => { for (let i = 1; i < FOGP.length; i++) if (d <= FOGP[i][0] || i === FOGP.length - 1) { const a = FOGP[i - 1], b = FOGP[i]; return out.setHex(a[1]).lerp(tmp.setHex(b[1]), clamp((d - a[0]) / (b[0] - a[0]), 0, 1)); } };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  let wd = 0;

  function update(dt, t, cam, sub) {
    const d = Math.max(0, -cam.position.y), sk = Math.exp(-d / 45);
    palAt(d, fog.color); fog.density = lerp(.011, .017, ss(0, 200, d)); scene.background.copy(fog.color);
    hemi.color.copy(fog.color).multiplyScalar(1.6).lerp(W, .15 * sk).lerp(tmp.setHex(0x3a4a9a), ss(100, 300, d) * .8);
    hemi.groundColor.copy(fog.color).multiplyScalar(.5).lerp(tmp.setHex(0xc9b483), .5 * sk); hemi.intensity = .35 + 1.1 * sk;
    sun.intensity = 1.6 * sk; U.caus.value = .75 * ss(80, 4, d); U.time.value = t;
    glowU.uFog.value = snowU.uFog.value = fog.density;
    const du = dome.material.uniforms; du.uF.value.copy(fog.color); du.uU.value.copy(fog.color).multiplyScalar(1.5 + 2.4 * Math.exp(-d / 160)).lerp(tmp.setHex(0x8fe9ff), .25 * Math.exp(-d / 100)); du.uD.value.copy(fog.color).multiplyScalar(.45); du.uS.value = .45 * Math.exp(-d / 60); dome.position.copy(cam.position);
    const uu = under.material.uniforms; uu.uCol.value.copy(palAt(0, tmp)); uu.uFogC.value.copy(fog.color); uu.uFog.value = fog.density; uu.uCam.value.copy(cam.position); under.position.set(cam.position.x, 0, cam.position.z); under.visible = d < 160;
    // corps et phares
    body.position.copy(sub.pos); body.quaternion.copy(sub.quat);
    const on = sub.lights && sub.batt > 0; heads.forEach(h => (h.intensity = on ? 45 : 0)); beam.material.uniforms.uI.value = on ? .035 * (1 - sk * .85) : 0;
    snowU.uCam.value.copy(cam.position); snowU.uLOn.value = on ? 1 : 0; snowU.uAmb.value = .05 + .45 * sk;
    snowU.uLP.value.set(0, -1.1, -7.6).applyQuaternion(sub.quat).add(sub.pos); snowU.uL.value.set(0, -.12, -1).normalize().applyQuaternion(sub.quat);
    // rayons
    const ra = .28 * ss(140, 5, d); rays.visible = ra > .01;
    for (const r of rays.children) { const u = r.userData; if (!u.init || Math.hypot(r.position.x - cam.position.x, r.position.z - cam.position.z) > 70) { const a = Math.random() * TAU, rr = 10 + Math.random() * 55; r.position.set(cam.position.x + Math.cos(a) * rr, 0, cam.position.z + Math.sin(a) * rr); u.init = true; }
      r.scale.set(u.w, u.l, 1); r.rotation.set(0, Math.atan2(cam.position.x - r.position.x, cam.position.z - r.position.z), .25, 'YXZ'); r.material.uniforms.uA.value = ra; }
    // cases de décor proches seulement
    const far = 1.9 / fog.density;
    for (const g of cells) g.visible = Math.hypot(g.userData.c.x - cam.position.x, g.userData.c.z - cam.position.z) < far + 75;
    // poissons
    const act = d < 50 ? NS : d < 160 ? 4 : 2;
    for (const s of schools) {
      const base = s.i * NPS;
      if (s.on && (s.i >= act || s.c.distanceTo(sub.pos) > 120)) s.on = false;
      if (!s.on && s.i < act && Math.random() < dt) {
        const a = Math.random() * TAU, r = 30 + Math.random() * 50, x = sub.pos.x + Math.cos(a) * r, z = sub.pos.z + Math.sin(a) * r, gr = H(x, z);
        if (-3 - gr > 7) { s.c.set(x, clamp(sub.pos.y + (Math.random() - .5) * 16, gr + 4, -3), z); s.sp = SPEC.find(p => -s.c.y < p.max); s.on = true; s.h = Math.random() * TAU;
          for (let i = 0; i < NPS; i++) fish.setColorAt(base + i, cc.setHex(pick(s.sp.cols, Math.random))); fish.instanceColor.needsUpdate = true; }
      }
      if (!s.on) { _m.makeScale(0, 0, 0); for (let i = 0; i < NPS; i++) fish.setMatrixAt(base + i, _m); continue; }
      s.h += Math.sin(t * .3 + s.t) * .45 * dt; _a.set(Math.sin(s.h), Math.sin(t * .4 + s.t) * .15, Math.cos(s.h));
      _b.subVectors(s.c, sub.pos); const dd = _b.length(); if (dd < 16) { _b.normalize(); _a.addScaledVector(_b, 3 * (1 - dd / 16)); }
      _a.normalize(); s.c.addScaledVector(_a, s.sp.sp * dt * (dd < 16 ? 2 : 1));
      const gr = H(s.c.x, s.c.z) + 3.5; if (s.c.y < gr) s.c.y = lerp(s.c.y, gr, .08); if (s.c.y > -2.5) s.c.y = -2.5;
      const sw = t * .3 + s.t;
      for (let i = 0; i < NPS; i++) {
        const o = s.off[i], cs = Math.cos(sw * .25), sn = Math.sin(sw * .25);
        _t.set(s.c.x + o.x * cs - o.z * sn + Math.sin(t * 1.3 + i) * .5, s.c.y + o.y + Math.sin(t * 1.7 + i * 1.3) * .4, s.c.z + o.x * sn + o.z * cs + Math.cos(t * 1.1 + i) * .5);
        _b.copy(_a).multiplyScalar(2).add(_s.set(Math.cos(sw * .6 + i) * .4, 0, Math.sin(sw * .6 + i) * .4)).normalize(); _q.setFromUnitVectors(_s.set(0, 0, 1), _b);
        const k = lerp(s.sp.sz[0], s.sp.sz[1], s.sc[i]); _m.compose(_t, _q, _s.set(k, k, k)); fish.setMatrixAt(base + i, _m);
      }
    }
    fish.instanceMatrix.needsUpdate = true;
    // l'épave : la lampe rouge se balance
    wreck.lamp.rotation.z = Math.sin(t * .9) * .5; wreck.lamp.rotation.x = Math.sin(t * .63) * .3;
    wreck.lamp.children[0].getWorldPosition(wreckLight.position); wreckLight.intensity = (cam.position.distanceTo(wreckLight.position) < 160 ? 1 : 0) * (60 + 25 * Math.sin(t * 9) * Math.sin(t * 2.3));
  }
  return { update, H, colliders: wreck.colliders };
}

// ---------------------------------------------------------------- l'épave du Gras-Fond
function buildWreck(scene, x, z, light) {
  const mat = withCaustics(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const half = (len, front) => {
    const c = new THREE.CylinderGeometry(3.2, 3.2, len, 24, 8, true), p = c.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > len / 2 - .01) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y - (.2 + 1.3 * Math.abs(Math.sin(a * 3.7)) + .3 * Math.abs(noise2(a * 2, 1.3)))); } }
    const cap = new THREE.SphereGeometry(3.2, 24, 8, 0, TAU, Math.PI / 2, Math.PI / 2); cap.translate(0, -len / 2, 0);
    const parts = [{ g: c }, { g: cap }];
    if (front) parts.push({ g: new THREE.BoxGeometry(1.4, 3.4, 4.6), m: M4(0, len * .05, -3.6) });
    const g = merge(parts), P = g.attributes.position, col = new Float32Array(P.count * 3), cc = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const X = P.getX(i), Y = P.getY(i), Z = P.getZ(i), n = noise2(X * .5 + Y * .3, Z * .5);
      cc.setHex(0x5a1828); if (Math.abs(Z - .8) < .16 && Math.abs(X) > 2) cc.setHex(0xd9a640); else if (n > .35) cc.lerp(new THREE.Color(0x7a4a2a), .7); else if (n < -.45) cc.lerp(new THREE.Color(0xb8b0a0), .6);
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, mat);
    const ring = new THREE.TorusGeometry(.5, .09, 6, 14), disc = new THREE.CircleGeometry(.42, 12), rp = [], dp = [];
    for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) { rp.push({ g: ring, m: M4(sx * 3.2, -len / 2 + 2.4 + k * 2.6, -.7, 0, Math.PI / 2) }); if (front || k % 2) dp.push({ g: disc, m: M4(sx * 3.23, -len / 2 + 2.4 + k * 2.6, -.7, 0, sx * Math.PI / 2) }); }
    mesh.add(new THREE.Mesh(merge(rp), new THREE.MeshLambertMaterial({ color: 0xd9a640, emissive: 0x2a1800 })));
    mesh.add(new THREE.Mesh(merge(dp), new THREE.MeshBasicMaterial({ color: front ? 0xffc66a : 0x6a4a28 })));
    return mesh;
  };
  const W = new THREE.Group(), a = half(16, true), b = half(14, false);
  a.rotation.set(Math.PI / 2 + .06, 0, .35); b.rotation.set(-Math.PI / 2 + .1, .35, -.3); a.position.set(0, 0, -10.5); b.position.set(1.8, .2, 10);
  W.add(a, b); W.position.set(x, H(x, z) + 1.2, z); W.rotation.y = .3; scene.add(W);
  const lg = new THREE.Group(); lg.position.set(0, 1.6, -5); W.add(lg);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a30 })); lamp.position.y = -1.2; lg.add(lamp);
  W.updateMatrixWorld(true);
  const colliders = [];
  for (let k = -3; k <= 3; k++) { colliders.push({ p: new THREE.Vector3(0, 0, -10.5 + k * 2.3).applyMatrix4(W.matrixWorld), r: 3.6 }); colliders.push({ p: new THREE.Vector3(1.8, .2, 10 + k * 2).applyMatrix4(W.matrixWorld), r: 3.6 }); }
  const keg = new THREE.LatheGeometry([[0, 0], [.42, 0], [.5, .12], [.55, .6], [.5, 1.08], [.42, 1.2], [0, 1.2]].map(p => new THREE.Vector2(p[0], p[1])), 14);
  const km = new THREE.MeshLambertMaterial({ color: 0x8f918c }), r = mulberry(86);
  for (let k = 0; k < 8; k++) { const an = r() * TAU, dd = 9 + r() * 16, kx = x + Math.cos(an) * dd, kz = z + Math.sin(an) * dd, m = new THREE.Mesh(keg, km); m.scale.setScalar(1.25); const lying = r() > .4; m.position.set(kx, H(kx, kz) + (lying ? .6 : -.1), kz); m.rotation.set(lying ? Math.PI / 2 : 0, r() * TAU, lying ? r() * .4 : 0); scene.add(m); }
  return { lamp: lg, colliders };
}
