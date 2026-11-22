// Gras-Fond, prototype n° 1 : marcher dans La Truffe, s'asseoir aux commandes et la piloter.
// Deux scènes : le dehors (avec brouillard) puis l'intérieur dessiné par-dessus, avec ses propres lumières.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, ss, damp, TAU } from './noise.js';
import { buildWorld, H, LIMIT, glowUniforms } from './world.js';
import { buildSub, animateSub, drawSonar, FLOOR, EYE } from './sub.js';
import { createInput } from './input.js';

const $ = s => document.querySelector(s);
const canvas = $('#c');
const R = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let PR = Math.min(devicePixelRatio || 1, 1.5); const PRMAX = PR;
R.setPixelRatio(PR);
R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;

const outside = new THREE.Scene(), inside = new THREE.Scene();
const env = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), .04).texture;
const cam = new THREE.PerspectiveCamera(72, 1, .04, 1500);
const world = buildWorld(outside);
const sub = buildSub(env);
inside.add(sub.root);
const inHemi = new THREE.HemisphereLight(0x6fb8d8, 0x2a1a10, .5); inside.add(inHemi);

const composer = new EffectComposer(R, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: matchMedia('(pointer:coarse)').matches ? 2 : 4 }));
composer.addPass(new RenderPass(outside, cam));
const pIn = new RenderPass(inside, cam); pIn.clear = false; pIn.clearDepth = true; composer.addPass(pIn);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .3, .45, .96); composer.addPass(bloom);
composer.addPass(new OutputPass());
// vignette légère, comme un vieil objectif
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 d=vUv-.5;c.rgb*=1.-dot(d,d)*.55;gl_FragColor=c;}' }));

const input = createInput(canvas);

// ---------------------------------------------------------------- état
const RATED = 160;
const S = {
  pos: new THREE.Vector3(0, -9, 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, yawRate: 0, pitchRate: 0,
  thr: 0, bal: .5, hull: 100, batt: 100, o2: 100, lights: false, quat: new THREE.Quaternion(),
};
const P = {   // le pilote
  mode: 'walk', pos: sub.spawn.clone(), yaw: 0, pitch: 0, bob: 0, speed: 0,
  seatT: 0, lookYaw: 0, lookPitch: 0, from: null,
};
const subM = new THREE.Matrix4(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
let started = false, shake = 0, kick = 0;
const ctl = { x: 0, y: 0, fill: false, vent: false };

function setThr(v) { S.thr = clamp(v, -.4, 1); if (Math.abs(S.thr) < .03) S.thr = 0; input.showThr(S.thr); }
setThr(0);

// ---------------------------------------------------------------- sous-marin
const HULL_PTS = [new THREE.Vector3(0, 0, -7.2), new THREE.Vector3(0, 0, 7.8), new THREE.Vector3(0, -1.9, 0), new THREE.Vector3(1.9, 0, 0), new THREE.Vector3(-1.9, 0, 0), new THREE.Vector3(0, 1.9, -3)];
function stepSub(dt) {
  const seated = P.mode === 'seat' && P.seatT > .95, power = S.batt > 0, k = input.keys;
  let ix = 0, iy = 0; ctl.fill = ctl.vent = false;
  if (seated) {
    ix = input.joy.x; iy = input.joy.y;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix = -1; if (k.has('KeyD') || k.has('ArrowRight')) ix = 1;
    if (k.has('ArrowUp')) iy = 1; if (k.has('ArrowDown')) iy = -1;
    if (k.has('KeyW')) setThr(S.thr + .7 * dt); if (k.has('KeyS')) setThr(S.thr - .7 * dt);
    if (input.thr !== null) { setThr(input.thr); input.thr = null; }
    if (input.consume('KeyX')) setThr(0);
    const fill = input.fill || k.has('ShiftLeft') || k.has('ShiftRight'), vent = input.vent || k.has('Space');
    if (fill) S.bal = Math.min(1, S.bal + .22 * dt); if (vent) S.bal = Math.max(0, S.bal - .28 * dt);
    ctl.fill = fill; ctl.vent = vent;
  }
  if (input.consume('KeyL')) S.lights = !S.lights;
  ctl.x = ix; ctl.y = iy;
  const speed = S.vel.length(), auth = power ? .35 + .65 * clamp(speed / 2.5, 0, 1) : .1;
  S.yawRate = damp(S.yawRate, -ix * .55 * auth, 2.2, dt); S.yaw += S.yawRate * dt;
  S.pitchRate = damp(S.pitchRate, iy * .45 * (power ? 1 : .2), 2.5, dt);
  S.pitch = clamp(S.pitch + S.pitchRate * dt, -.6, .6); if (Math.abs(iy) < .05) S.pitch = damp(S.pitch, 0, .5, dt);
  S.roll = damp(S.roll, -S.yawRate * .45 * clamp(speed / 2.5, 0, 1), 1.5, dt);
  _e.set(S.pitch, S.yaw, S.roll); S.quat.setFromEuler(_e);
  _f.set(0, 0, -1).applyQuaternion(S.quat);
  S.vel.addScaledVector(_f, (power ? S.thr : 0) * 2.4 * dt);
  S.vel.y += -(S.bal - .5) * 3 * dt;
  S.vel.x *= Math.exp(-.5 * dt); S.vel.z *= Math.exp(-.5 * dt); S.vel.y *= Math.exp(-1.1 * dt);
  // un peu de houle sous la surface
  S.vel.y += Math.sin(clock * .7) * .02 * dt * ss(-40, 0, S.pos.y);
  S.pos.addScaledVector(S.vel, dt);
  if (S.pos.y > -.2) { S.pos.y = -.2; S.vel.y = Math.min(0, S.vel.y); }
  // courant qui ramène vers la zone
  const off = Math.max(Math.abs(S.pos.x), Math.abs(S.pos.z)) - LIMIT; if (off > 0) { _v.set(S.pos.x, 0, S.pos.z).normalize(); S.vel.addScaledVector(_v, -off * .2 * dt); }
  // collisions coque / fond
  subM.compose(S.pos, S.quat, _v.set(1, 1, 1));
  let push = 0, hitN = null;
  for (const p of HULL_PTS) {
    const w = p.clone().applyMatrix4(subM), g = H(w.x, w.z) + .3;
    if (g - w.y > push) { push = g - w.y; hitN = w; }
  }
  if (hitN) {
    const w = hitN, e = 1.5; _n.set(-(H(w.x + e, w.z) - H(w.x - e, w.z)), 2 * e, -(H(w.x, w.z + e) - H(w.x, w.z - e))).normalize();
    const vn = S.vel.dot(_n); if (vn < 0) { S.vel.addScaledVector(_n, -vn * 1.3); if (-vn > 1.2) hit(-vn); }
    S.pos.y += push;
  }
  for (const c of world.colliders) { _v.subVectors(S.pos, c.p); const d = _v.length(), r = c.r + 2; if (d < r && d > .01) { _v.multiplyScalar(1 / d); const vn = S.vel.dot(_v); if (vn < 0) { S.vel.addScaledVector(_v, -vn * 1.3); if (-vn > 1.2) hit(-vn); } S.pos.addScaledVector(_v, r - d); } }
  // systèmes
  const depth = -S.pos.y;
  S.batt = clamp(S.batt - (.01 + Math.abs(S.thr) * .06 + (S.lights ? .02 : 0)) * dt, 0, 100);
  if (depth < 1) { S.batt = Math.min(100, S.batt + 1.5 * dt); S.o2 = Math.min(100, S.o2 + 8 * dt); S.hull = Math.min(100, S.hull + .5 * dt); }
  else S.o2 = Math.max(0, S.o2 - .06 * dt);
  if (depth > RATED) { S.hull -= (depth - RATED) / 60 * .8 * dt; if (Math.random() < dt * .6) shake = Math.max(shake, .25); }
  if (S.hull <= 0 || S.o2 <= 0) reset();
}
function hit(v) { shake = Math.min(1, shake + v * .3); S.hull = Math.max(0, S.hull - Math.max(0, v - 1.2) * 6); kick += v * 90; }
function reset() {
  S.pos.set(0, -9, 0); S.vel.set(0, 0, 0); S.yaw = S.pitch = S.roll = 0; S.hull = S.batt = S.o2 = 100; S.bal = .5; setThr(0);
  fade = 1;
}
let fade = 0;

// ---------------------------------------------------------------- pilote : marcher, s'asseoir
const seatLook = new THREE.Vector3();
function stepPilot(dt) {
  const k = input.keys, lx = input.lookX, ly = input.lookY; input.lookX = input.lookY = 0;
  const sens = input.mobile ? .0042 : .0022;
  if (P.mode === 'walk') {
    P.yaw -= lx * sens; P.pitch = clamp(P.pitch - ly * sens, -1.35, 1.35);
    let fx = input.joy.x, fz = input.joy.y;
    if (k.has('KeyW') || k.has('ArrowUp')) fz = 1; if (k.has('KeyS') || k.has('ArrowDown')) fz = -1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx = -1; if (k.has('KeyD') || k.has('ArrowRight')) fx = 1;
    const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
    const sp = (k.has('ShiftLeft') ? 2.4 : 1.6);
    const vx = (Math.cos(P.yaw) * fx - Math.sin(P.yaw) * fz) * sp, vz = (-Math.sin(P.yaw) * fx - Math.cos(P.yaw) * fz) * sp;
    P.vx = damp(P.vx || 0, vx, 10, dt); P.vz = damp(P.vz || 0, vz, 10, dt);
    P.pos.x += P.vx * dt; P.pos.z += P.vz * dt; sub.collide(P.pos);
    P.speed = Math.hypot(P.vx, P.vz); P.bob += P.speed * dt * 5.2;
    const near = Math.hypot(P.pos.x - sub.seatSpot.x, P.pos.z - sub.seatSpot.z) < 1.0;
    prompt(near ? (input.mobile ? '' : '<b>E</b> · s’asseoir aux commandes') : '', near ? 'S’asseoir' : '');
    if (near && input.consume('KeyE')) { P.mode = 'seat'; P.seatT = 0; P.from = { pos: P.pos.clone(), yaw: P.yaw, pitch: P.pitch }; P.lookYaw = 0; P.lookPitch = -.2; document.body.classList.add('seated'); }
  } else {
    P.seatT = Math.min(1, P.seatT + dt * 1.6);
    P.lookYaw = clamp(P.lookYaw - lx * sens, -1.9, 1.9); P.lookPitch = clamp(P.lookPitch - ly * sens, -1.1, 1.0);
    prompt('', 'Se lever');
    if (input.consume('KeyE') && P.seatT > .9) {
      P.mode = 'walk'; P.pos.set(0, FLOOR, -3.2); P.yaw = Math.PI; P.pitch = 0; sub.collide(P.pos); document.body.classList.remove('seated');
    }
  }
  input.pressed.delete('KeyE');
}
function pilotCamera() {
  // position et orientation dans le repère du sous-marin, puis passage au monde
  let lp, ly, lpit;
  const walkEye = _v.set(P.pos.x + Math.sin(P.bob * 2) * .02, FLOOR + EYE + Math.abs(Math.sin(P.bob)) * .035 - .015, P.pos.z);
  if (P.mode === 'walk') { lp = walkEye; ly = P.yaw; lpit = P.pitch; }
  else {
    const t = ss(0, 1, P.seatT), f = P.from;
    lp = seatLook.set(lerp(f.pos.x, sub.seatEye.x, t), lerp(FLOOR + EYE, sub.seatEye.y, t), lerp(f.pos.z, sub.seatEye.z, t));
    let dy = (0 - f.yaw) % TAU; if (dy > Math.PI) dy -= TAU; if (dy < -Math.PI) dy += TAU;
    ly = f.yaw + dy * t + P.lookYaw * t; lpit = lerp(f.pitch, P.lookPitch, t);
  }
  cam.position.copy(lp).applyMatrix4(subM);
  _e.set(lpit, ly, 0); _q.setFromEuler(_e); cam.quaternion.copy(S.quat).multiply(_q);
  if (shake > 0) { cam.position.x += Math.sin(clock * 37) * shake * .03; cam.position.y += Math.sin(clock * 29) * shake * .03; }
}
const promptEl = $('#prompt'), actEl = $('#act');
let lastPrompt = null, lastAct = null;
function prompt(html, act) {
  if (html !== lastPrompt) { promptEl.innerHTML = html; promptEl.classList.toggle('on', !!html); lastPrompt = html; }
  if (act !== lastAct) { actEl.textContent = act; lastAct = act; }
}

// ---------------------------------------------------------------- animation de l'intérieur
let sonT = 0, contacts = [], sonRange = 120;
function animateInside(dt) {
  sub.root.position.copy(S.pos); sub.root.quaternion.copy(S.quat);
  inHemi.color.copy(outside.fog.color).multiplyScalar(1.3); inHemi.intensity = .2 + .45 * Math.exp(S.pos.y / 40);
  animateSub(sub, { stickX: ctl.x, stickY: ctl.y, thr: S.thr, bal: S.bal, fill: ctl.fill, vent: ctl.vent, pitch: S.pitch, roll: S.roll, yawRate: S.yawRate, batt: S.batt, hull: S.hull, o2: S.o2, depth: -S.pos.y, rated: RATED, lights: S.lights, kick, playerZ: P.mode === 'seat' ? -4 : P.pos.z }, dt, clock);
  kick = 0;
  sonT -= dt; if (sonT <= 0) { sonT = .4; sampleSonar(); }
  drawSonar(sub, contacts, (clock * 2.2) % TAU, sonRange, S.vel.length() * 1.944, ((-S.yaw * 180 / Math.PI) % 360 + 360) % 360, S.batt > 0);
}
function sampleSonar() {
  contacts = []; const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
  for (let a = 0; a < 28; a++) { const ph = a / 28 * TAU, c = Math.cos(ph), s = Math.sin(ph), dx = fx * c + rx * s, dz = fz * c + rz * s;
    for (let r = 1; r <= 7; r++) { const rr = r / 7 * sonRange, dy = H(S.pos.x + dx * rr, S.pos.z + dz * rr) - S.pos.y; if (dy > -6) contacts.push([ph, rr / sonRange, 1]); else if (dy > -25) contacts.push([ph, rr / sonRange, .35]); } }
}

// ---------------------------------------------------------------- boucle
function resize() {
  const w = innerWidth, h = innerHeight; R.setPixelRatio(PR); R.setSize(w, h, false); composer.setPixelRatio(PR); composer.setSize(w, h);
  bloom.resolution.set(w * PR / 2, h * PR / 2);
  cam.aspect = w / h; cam.fov = w < h ? 92 : 70; cam.updateProjectionMatrix();
  glowUniforms.uPx.value = h * PR / (2 * Math.tan(cam.fov * Math.PI / 360));
}
addEventListener('resize', resize); resize();
let last = performance.now(), clock = 0, ft = 16, ftT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; ft = lerp(ft, dt * 1000, .05); dt = Math.min(dt, .05); clock += dt;
  if (started) { stepSub(dt); stepPilot(dt); } else { _e.set(S.pitch, S.yaw, S.roll); S.quat.setFromEuler(_e); }
  shake = Math.max(0, shake - dt * 1.5);
  subM.compose(S.pos, S.quat, _v.set(1, 1, 1));
  pilotCamera();
  world.update(dt, clock, cam, S);
  animateInside(dt);
  composer.render();
  if (fade > 0) { fade = Math.max(0, fade - dt * .6); }
  canvas.style.filter = fade > 0 ? `brightness(${1 - fade})` : '';
  ftT += dt; if (ftT > 2.5) { ftT = 0; if (ft > 30 && PR > .6) { PR = Math.max(.6, PR - .15); resize(); } else if (ft < 15 && PR < PRMAX) { PR = Math.min(PRMAX, PR + .1); resize(); } }
}
requestAnimationFrame(frame);

$('#go').addEventListener('click', () => {
  $('#start').classList.add('hidden'); started = true;
  if (!input.mobile) canvas.requestPointerLock?.();
});
// pour les essais
window.__gf = { S, P, H, cam, R, tp(x, y, z, yaw = 0) { S.pos.set(x, y, z); S.vel.set(0, 0, 0); S.yaw = yaw; }, sit() { P.mode = 'seat'; P.seatT = 1; P.from = { pos: P.pos.clone(), yaw: 0, pitch: 0 }; P.lookYaw = 0; P.lookPitch = -.2; } };
