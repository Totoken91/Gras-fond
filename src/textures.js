// Matières peintes à la main en canvas : couleur, relief (carte de normales) et rugosité.
// Chaque fonction dessine une carte de hauteur en niveaux de gris en même temps que la couleur,
// puis on en tire la carte de normales. Tout est calculé une fois au chargement.
import * as THREE from 'three';
import { mulberry, noise2, TAU } from './noise.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb, rep) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (rep) t.repeat.set(rep[0], rep[1]); return t;
}
function normalFrom(hc, strength = 2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data, out = cv(w, h), g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * .5 + .5) * 255; d[i + 1] = (dy / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return out;
}
function speckle(g, w, h, n, col, a, smin, smax, r) {
  for (let i = 0; i < n; i++) { const s = smin + r() * (smax - smin), x = r() * w, y = r() * h, gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, col.replace('A', a * r())); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
}
function bump(g, x, y, r, v = 255) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgb(${v},${v},${v})`); gr.addColorStop(.6, `rgba(${v},${v},${v},.6)`); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function rivetC(g, x, y, r) { const gr = g.createRadialGradient(x - r * .35, y - r * .35, 0, x, y, r); gr.addColorStop(0, 'rgba(255,250,235,.55)'); gr.addColorStop(.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

// Coque : un panneau entre deux membrures. u = tour (0 = bas), v = longueur.
export function hullMaps() {
  const W = 1024, Hh = 512, r = mulberry(11), c = cv(W, Hh), h = cv(W, Hh), rg = cv(W, Hh), g = c.getContext('2d'), gh = h.getContext('2d'), gr = rg.getContext('2d');
  gh.fillStyle = '#808080'; gh.fillRect(0, 0, W, Hh); gr.fillStyle = '#909090'; gr.fillRect(0, 0, W, Hh);
  // peinture : soubassement bordeaux, haut crème, filet laiton
  g.fillStyle = '#e6d6b2'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#7a1c2c'; g.fillRect(0, 0, W * .22, Hh); g.fillRect(W * .78, 0, W * .22, Hh);
  g.fillStyle = '#b8873a'; g.fillRect(W * .22, 0, 10, Hh); g.fillRect(W * .78 - 10, 0, 10, Hh);
  gr.fillStyle = '#505050'; gr.fillRect(W * .22, 0, 10, Hh); gr.fillRect(W * .78 - 10, 0, 10, Hh);
  // tôles : joints, cordons de soudure, rivets
  const seamsU = 10;
  for (let k = 0; k <= seamsU; k++) {
    const x = k * W / seamsU;
    gh.fillStyle = '#5a5a5a'; gh.fillRect(x - 2, 0, 4, Hh); g.fillStyle = 'rgba(60,40,25,.35)'; g.fillRect(x - 1.5, 0, 3, Hh);
    for (let y = 18; y < Hh; y += 30) { bump(gh, x + 11, y, 5.5); rivetC(g, x + 11, y, 5); }
  }
  for (const y of [6, Hh - 6]) { gh.fillStyle = '#9a9a9a'; gh.fillRect(0, y - 4, W, 8); for (let x = 6; x < W; x += 26) { bump(gh, x, y, 5); rivetC(g, x, y, 4.5); } }
  // usure : écaillures (métal nu), coulures, crasse dans les bas
  for (let i = 0; i < 35; i++) { const x = r() * W, y = r() * Hh, s = 1.5 + r() * 4; g.fillStyle = 'rgba(170,160,140,.55)'; g.beginPath(); g.ellipse(x, y, s, s * .7, r() * 3, 0, TAU); g.fill(); gh.fillStyle = '#6a6a6a'; gh.beginPath(); gh.ellipse(x, y, s, s * .7, 0, 0, TAU); gh.fill(); gr.fillStyle = '#4a4a4a'; gr.beginPath(); gr.ellipse(x, y, s, s * .7, 0, 0, TAU); gr.fill(); }
  for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * Hh, l = 20 + r() * 80; const gg = g.createLinearGradient(x, y, x, y + l); gg.addColorStop(0, 'rgba(90,55,25,.35)'); gg.addColorStop(1, 'rgba(90,55,25,0)'); g.fillStyle = gg; g.fillRect(x, y, 2 + r() * 3, l); }
  speckle(g, W, Hh, 220, 'rgba(70,45,25,A)', .22, 6, 46, r);
  const bottom = g.createLinearGradient(0, 0, W * .25, 0); bottom.addColorStop(0, 'rgba(20,10,5,.45)'); bottom.addColorStop(1, 'rgba(20,10,5,0)'); g.fillStyle = bottom; g.fillRect(0, 0, W * .25, Hh);
  const bottom2 = g.createLinearGradient(W, 0, W * .75, 0); bottom2.addColorStop(0, 'rgba(20,10,5,.45)'); bottom2.addColorStop(1, 'rgba(20,10,5,0)'); g.fillStyle = bottom2; g.fillRect(W * .75, 0, W * .25, Hh);
  return { map: tex(c, true), normalMap: tex(normalFrom(h, 3)), roughnessMap: tex(rg) };
}

// Tôle larmée (anti-dérapante) pour le plancher
export function treadMaps() {
  const S = 256, r = mulberry(5), c = cv(S, S), h = cv(S, S), g = c.getContext('2d'), gh = h.getContext('2d');
  g.fillStyle = '#5b5650'; g.fillRect(0, 0, S, S); gh.fillStyle = '#707070'; gh.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 32) for (const [ox, oy, a] of [[8, 8, .6], [24, 24, -.6]]) {
    for (const [gg, col] of [[gh, '#d8d8d8'], [g, 'rgba(160,152,140,.9)']]) { gg.save(); gg.translate(x + ox, y + oy); gg.rotate(a); gg.fillStyle = col; gg.beginPath(); gg.ellipse(0, 0, 9, 2.6, 0, 0, TAU); gg.fill(); gg.restore(); }
  }
  speckle(g, S, S, 40, 'rgba(25,18,12,A)', .4, 10, 50, r);
  speckle(g, S, S, 30, 'rgba(200,190,170,A)', .15, 5, 25, r);
  return { map: tex(c, true), normalMap: tex(normalFrom(h, 4)) };
}

// Cuir capitonné bordeaux
export function leatherMaps() {
  const S = 256, r = mulberry(7), c = cv(S, S), h = cv(S, S), g = c.getContext('2d'), gh = h.getContext('2d');
  g.fillStyle = '#7f1d30'; g.fillRect(0, 0, S, S); gh.fillStyle = '#909090'; gh.fillRect(0, 0, S, S);
  for (let y = 0; y <= S; y += 64) for (let x = 0; x <= S; x += 64) for (const [ox, oy] of [[0, 0], [32, 32]]) {
    const cx = x + ox, cy = y + oy, gr = gh.createRadialGradient(cx, cy, 2, cx, cy, 34); gr.addColorStop(0, '#303030'); gr.addColorStop(.25, '#707070'); gr.addColorStop(1, '#c0c0c0'); gh.fillStyle = gr; gh.fillRect(cx - 34, cy - 34, 68, 68);
    const cg = g.createRadialGradient(cx, cy, 1, cx, cy, 30); cg.addColorStop(0, 'rgba(30,5,10,.7)'); cg.addColorStop(.3, 'rgba(30,5,10,.15)'); cg.addColorStop(1, 'rgba(255,200,200,.06)'); g.fillStyle = cg; g.fillRect(cx - 32, cy - 32, 64, 64);
    g.fillStyle = '#d9a650'; g.beginPath(); g.arc(cx, cy, 2.5, 0, TAU); g.fill();
  }
  for (let i = 0; i < 4000; i++) { const x = r() * S, y = r() * S; g.fillStyle = `rgba(0,0,0,${r() * .08})`; g.fillRect(x, y, 1, 1); }
  return { map: tex(c, true), normalMap: tex(normalFrom(h, 2.5)) };
}

// Bois des caisses
export function woodMaps(label = 'PORT-COCHON') {
  const S = 256, r = mulberry(13), c = cv(S, S), h = cv(S, S), g = c.getContext('2d'), gh = h.getContext('2d');
  gh.fillStyle = '#a0a0a0'; gh.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 64) {
    g.fillStyle = ['#9b6b3c', '#8e6033', '#a8773f', '#946638'][y / 64]; g.fillRect(0, y, S, 60);
    g.fillStyle = '#3a2412'; g.fillRect(0, y + 60, S, 4); gh.fillStyle = '#303030'; gh.fillRect(0, y + 60, S, 4);
    for (let i = 0; i < 14; i++) { const yy = y + 4 + r() * 52; g.strokeStyle = `rgba(60,35,15,${.15 + r() * .25})`; g.lineWidth = .6 + r() * 1.4; g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(80, yy + (r() - .5) * 8, 170, yy + (r() - .5) * 8, S, yy + (r() - .5) * 4); g.stroke(); }
    for (const x of [14, S - 14]) { rivetC(g, x, y + 30, 4); bump(gh, x, y + 30, 4); }
  }
  g.save(); g.translate(S / 2, S / 2); g.rotate(-.04); g.fillStyle = 'rgba(109,21,38,.85)'; g.font = 'bold 30px Georgia,serif'; g.textAlign = 'center'; g.fillText(label, 0, 10); g.font = 'bold 18px Georgia,serif'; g.fillText('FRAGILE · LARD', 0, 40); g.restore();
  return { map: tex(c, true), normalMap: tex(normalFrom(h, 2)) };
}

// Laiton brossé : juste un léger grain
export function brushedMaps() {
  const S = 128, c = cv(S, S), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) { g.fillStyle = `rgba(${Math.random() < .5 ? 0 : 255},${Math.random() < .5 ? 0 : 255},${Math.random() < .5 ? 0 : 255},.06)`; g.fillRect(0, y, S, 1); }
  return { roughnessMap: tex(c) };
}

// Peinture marteau verte des machines
export function hammerMaps(color = '#2f4a3c') {
  const S = 256, r = mulberry(3), c = cv(S, S), h = cv(S, S), g = c.getContext('2d'), gh = h.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S); gh.fillStyle = '#808080'; gh.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) { const x = r() * S, y = r() * S, s = 2 + r() * 6; bump(gh, x, y, s, r() < .5 ? 60 : 200); }
  speckle(g, S, S, 60, 'rgba(0,0,0,A)', .25, 6, 30, r); speckle(g, S, S, 30, 'rgba(255,240,200,A)', .08, 4, 20, r);
  return { map: tex(c, true), normalMap: tex(normalFrom(h, 1.6)) };
}

// Cadran : fond crème, graduations, chiffres. Dessiné une fois ; l'aiguille est un objet 3D.
export function dialFace({ label, labels = [], red, ticks = 10, sub = '' }) {
  const S = 256, c = cv(S, S), g = c.getContext('2d'), R = S / 2;
  const gr = g.createRadialGradient(R, R * .8, 10, R, R, R); gr.addColorStop(0, '#fbf3df'); gr.addColorStop(1, '#dcc79a'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.translate(R, R);
  const A0 = -Math.PI * .75 - Math.PI / 2, A1 = Math.PI * .75 - Math.PI / 2, ang = t => A0 + t * (A1 - A0);
  if (red) { g.strokeStyle = '#c11f2c'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, R * .74, ang(red[0]), ang(red[1])); g.stroke(); }
  g.strokeStyle = '#4b0e19';
  for (let i = 0; i <= ticks * 2; i++) { const a = ang(i / (ticks * 2)), mj = i % 2 === 0; g.lineWidth = mj ? 5 : 2.2; g.beginPath(); g.moveTo(Math.cos(a) * R * (mj ? .6 : .7), Math.sin(a) * R * (mj ? .6 : .7)); g.lineTo(Math.cos(a) * R * .84, Math.sin(a) * R * .84); g.stroke(); }
  g.fillStyle = '#4b0e19'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 26px "Barlow Condensed",Arial Narrow,sans-serif';
  labels.forEach((t, i) => { const a = ang(i / (labels.length - 1)); g.fillText(t, Math.cos(a) * R * .45, Math.sin(a) * R * .45); });
  g.font = '700 30px "Barlow Condensed",Arial Narrow,sans-serif'; g.fillText(label, 0, R * .5);
  if (sub) { g.font = '600 20px "Barlow Condensed",Arial Narrow,sans-serif'; g.fillStyle = '#8a5a3a'; g.fillText(sub, 0, R * .72); }
  return tex(c, true);
}
export function plateTex(text, w = 512, h = 96) {
  const c = cv(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2d58e'); gr.addColorStop(1, '#a87a30'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#5a3b17'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#3a1d12'; g.font = `400 ${h * .48}px Bevan,Georgia,serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  for (const x of [18, w - 18]) rivetC(g, x, h / 2, 6);
  return tex(c, true);
}
export { noise2 };

// Hublots percés dans la coque : carte de transparence sur tout le cylindre (pas de répétition).
// ports = [[u, v, ru, rv]] en coordonnées de texture.
export function hullAlpha(ports) {
  const W = 2048, H = 1024, c = cv(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000';
  for (const [u, v, ru, rv] of ports) { g.beginPath(); g.ellipse(u * W, (1 - v) * H, ru * W, rv * H, 0, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

// Caillebotis : barreaux d'acier, trous transparents
export function gratingMaps() {
  const S = 256, c = cv(S, S), a = cv(S, S), h = cv(S, S), g = c.getContext('2d'), ga = a.getContext('2d'), gh = h.getContext('2d'), r = mulberry(21);
  g.fillStyle = '#5e5951'; g.fillRect(0, 0, S, S); ga.fillStyle = '#fff'; ga.fillRect(0, 0, S, S); gh.fillStyle = '#a0a0a0'; gh.fillRect(0, 0, S, S);
  ga.fillStyle = '#000'; gh.fillStyle = '#202020';
  for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 16) { ga.fillRect(x + 4, y + 4, 9, 25); gh.fillRect(x + 3, y + 3, 11, 27); }
  speckle(g, S, S, 40, 'rgba(20,14,10,A)', .45, 8, 40, r); speckle(g, S, S, 20, 'rgba(210,200,180,A)', .2, 4, 16, r);
  return { map: tex(c, true), alphaMap: tex(a), normalMap: tex(normalFrom(h, 3)) };
}

// Affiches et plaques d'ambiance
function paper(w, h, draw) {
  const c = cv(w, h), g = c.getContext('2d'), r = mulberry(w + h);
  g.fillStyle = '#efe2c2'; g.fillRect(0, 0, w, h); speckle(g, w, h, 60, 'rgba(120,80,40,A)', .12, 10, 60, r);
  draw(g, w, h);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .7); v.addColorStop(0, 'rgba(80,50,20,0)'); v.addColorStop(1, 'rgba(80,50,20,.35)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  return tex(c, true);
}
export function posterAmbree() {
  return paper(384, 512, (g, w, h) => {
    g.fillStyle = '#6d1526'; g.fillRect(18, 18, w - 36, h - 36);
    g.fillStyle = '#f3e8d0'; g.textAlign = 'center'; g.font = '400 46px Bevan,Georgia,serif'; g.fillText('DOUZI', w / 2, 86); g.fillText('AMBRÉE', w / 2, 136);
    // la chope
    const x = w / 2 - 60, y = 170;
    g.fillStyle = '#ffc54e'; g.fillRect(x, y + 40, 120, 190); g.fillStyle = '#c25f0e'; g.fillRect(x, y + 150, 120, 80);
    g.fillStyle = '#fff4dc'; for (const [dx, dy, rr] of [[10, 40, 26], [45, 30, 30], [85, 38, 28], [115, 44, 20]]) { g.beginPath(); g.arc(x + dx, y + dy, rr, 0, TAU); g.fill(); }
    g.strokeStyle = '#f3e8d0'; g.lineWidth = 12; g.beginPath(); g.arc(x + 130, y + 130, 40, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.strokeStyle = '#f3e8d0'; g.lineWidth = 5; g.strokeRect(x, y + 40, 120, 190);
    g.fillStyle = '#f2c14e'; g.font = '700 30px "Barlow Condensed",sans-serif'; g.fillText('TOUJOURS PLUS', w / 2, h - 60);
  });
}
export function noticeTex() {
  return paper(512, 320, (g, w, h) => {
    g.fillStyle = '#6d1526'; g.fillRect(0, 0, w, 60); g.fillStyle = '#f3e8d0'; g.font = '400 30px Bevan,Georgia,serif'; g.textAlign = 'center'; g.fillText('RÈGLEMENT DE BORD', w / 2, 42);
    g.fillStyle = '#2a1a10'; g.textAlign = 'left'; g.font = '700 26px "Barlow Condensed",sans-serif';
    ['Art. 8.6 : écouter la personne', 'qui demande de baisser le son.', '', 'Art. 12 : pas de fête en plongée.', 'Art. 13 : même petite.'].forEach((l, i) => g.fillText(l, 34, 110 + i * 38));
    g.fillStyle = '#8e2438'; g.font = '700 20px "Barlow Condensed",sans-serif'; g.textAlign = 'right'; g.fillText('L’Amirauté de Port-Cochon', w - 30, h - 24);
  });
}
export function stencilTex(text, col = '#f2c14e', bg = '#1a1510') {
  const c = cv(512, 128), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  for (let i = -4; i < 20; i++) { g.fillStyle = i % 2 ? col : bg; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 - 32, 128); g.lineTo(i * 32 - 64, 128); g.fill(); }
  g.fillStyle = bg; g.fillRect(24, 26, 464, 76); g.fillStyle = col; g.font = '700 56px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66);
  return tex(c, true);
}
