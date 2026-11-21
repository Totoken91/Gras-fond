// Entrées : clavier + souris (verrouillage du pointeur) sur ordinateur, joystick et glisser sur téléphone.
const $ = s => document.querySelector(s);

export function createInput(canvas) {
  const I = {
    keys: new Set(), lookX: 0, lookY: 0, joy: { x: 0, y: 0 }, thr: null, fill: false, vent: false,
    mobile: matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window,
    pressed: new Set(),           // touches appuyées depuis la dernière image
    consume(code) { const h = this.pressed.has(code); this.pressed.delete(code); return h; },
  };
  if (I.mobile) document.body.classList.add('mobile');

  addEventListener('keydown', e => {
    if (!e.repeat) I.pressed.add(e.code);
    I.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => I.keys.delete(e.code));
  addEventListener('blur', () => { I.keys.clear(); I.fill = I.vent = false; });

  // souris
  canvas.addEventListener('click', () => { if (!I.mobile && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
  addEventListener('mousemove', e => { if (document.pointerLockElement === canvas && Math.abs(e.movementX) < 250 && Math.abs(e.movementY) < 250) { I.lookX += e.movementX; I.lookY += e.movementY; } });

  // tactile : glisser pour regarder (partout sauf sur les commandes)
  const looks = new Map();
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; looks.set(e.pointerId, [e.clientX, e.clientY]); });
  canvas.addEventListener('pointermove', e => { const p = looks.get(e.pointerId); if (!p) return; I.lookX += (e.clientX - p[0]) * 1.6; I.lookY += (e.clientY - p[1]) * 1.6; p[0] = e.clientX; p[1] = e.clientY; });
  const endLook = e => looks.delete(e.pointerId);
  canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

  // joystick
  const joy = $('#joy'), knob = $('#joyk'); let jid = null;
  const moveJoy = e => { const r = joy.getBoundingClientRect(), R = r.width * .36; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } I.joy.x = dx / R; I.joy.y = -dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  joy.addEventListener('pointerdown', e => { e.preventDefault(); jid = e.pointerId; joy.setPointerCapture(jid); moveJoy(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) moveJoy(e); });
  const endJoy = e => { if (e.pointerId !== jid) return; jid = null; I.joy.x = I.joy.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);

  // manette des gaz tactile
  const thr = $('#thr'), thk = $('#thrk'); let tid = null;
  const moveThr = e => { const r = thr.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); I.thr = 1 - f * 1.4; };
  thr.addEventListener('pointerdown', e => { e.preventDefault(); tid = e.pointerId; thr.setPointerCapture(tid); moveThr(e); });
  thr.addEventListener('pointermove', e => { if (e.pointerId === tid) moveThr(e); });
  thr.addEventListener('pointerup', () => (tid = null));
  I.showThr = v => { thk.style.top = ((1 - v) / 1.4 * 100).toFixed(1) + '%'; };

  // boutons maintenus
  for (const [id, key] of [['#fill', 'fill'], ['#vent', 'vent']]) {
    const b = $(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); I[key] = true; b.classList.add('press'); b.setPointerCapture(e.pointerId); });
    const off = () => { I[key] = false; b.classList.remove('press'); };
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
  $('#act').addEventListener('pointerdown', e => { e.preventDefault(); I.pressed.add('KeyE'); });
  $('#lights').addEventListener('pointerdown', e => { e.preventDefault(); I.pressed.add('KeyL'); });
  return I;
}
