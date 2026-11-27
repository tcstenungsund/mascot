'use strict';
// Neon kaomoji mascot. Three parts:
//   Model      – createMascot(): decides which face to show. Knows nothing about the page; the time
//                is always passed in, so tests can use a fake clock.
//   View       – createView(): puts the face on the page.
//   Controller – start(): wires keyboard, mouse, motion sensor and a 50 ms timer to the model.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MODE_FACE = { awake: 'home', drowsy: 'yawn', asleep: 'sleep', brief: 'groggy' };
const LAST_RESORT_FACE = '(・‿・)'; // if config.js has no usable "home" face either

// ---------- Model ----------

function createMascot(config, now) {
  const rand = ([min, max]) => (min + Math.random() * (max - min)) * SECOND;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const warned = new Set();
  // Object.hasOwn: only our own faces count, not built-in names like "constructor" from a URL.
  const faceList = name => (Object.hasOwn(config.faces, name) && config.faces[name].length ? config.faces[name] : null);
  const face = name => {
    const list = faceList(name);
    if (!list && !warned.has(name)) {
      warned.add(name);
      console.warn(`config.js: no face called "${name}" – shows home instead`);
    }
    return pick(list ?? faceList('home') ?? [LAST_RESORT_FACE]);
  };

  const state = {
    mode: 'asleep',         // awake | drowsy | asleep | brief (groggy off-hours wake)
    base: '',               // the face that belongs to the current mode
    modeUntil: 0,           // when drowsy/brief turns into asleep
    temp: null,             // short-lived face on top of base: blink, mood, greeting, moment
    tempUntil: 0,
    held: null,             // manual override, stays until auto()
    lastActivity: now,
    lastGreet: -Infinity,
    lastMood: null,
    nextBlink: 0,
    nextMood: 0,
    nextGlance: 0,
    firedMoments: new Set(),
    look: { x: 0, y: 0 },   // where it looks, -1…1 on each axis
    lookUntil: 0,
    pokes: [],              // times of recent clicks/taps
  };
  const clamp = n => Math.max(-1, Math.min(1, n));

  function isOpen(t) {
    const d = new Date(t);
    const minutes = d.getHours() * 60 + d.getMinutes();
    const { days, from, to } = config.schoolHours;
    return days.includes(d.getDay() || 7) && minutes >= toMinutes(from) && minutes < toMinutes(to);
  }

  function setMode(mode, until = 0) {
    state.mode = mode;
    state.modeUntil = until;
    state.base = face(MODE_FACE[mode]);
    state.temp = null;
  }

  function flash(name, t, ms) {
    state.temp = face(name);
    state.tempUntil = t + ms;
  }

  function wake(t) {
    setMode('awake');
    flash('surprised', t, 2 * SECOND);
    state.nextBlink = t + rand(config.blinkEverySeconds);
    state.nextMood = t + rand(config.idleMoodEverySeconds);
    state.nextGlance = t + rand(config.glanceEverySeconds);
  }

  function lookAt(x, y, t, ms) {
    state.look = { x: clamp(x), y: clamp(y) };
    state.lookUntil = t + ms;
  }

  // Weighted random mood, never the same one twice in a row. null when there are no moods to pick.
  function pickMood() {
    const all = Object.entries(config.idleMoods).filter(([, weight]) => weight > 0);
    const fresh = all.filter(([name]) => name !== state.lastMood);
    const entries = fresh.length ? fresh : all;
    if (!entries.length) return null;
    let r = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [name, weight] of entries) {
      if ((r -= weight) < 0) return (state.lastMood = name);
    }
    return (state.lastMood = entries.at(-1)[0]); // rounding edge case
  }

  function dueMoment(t) {
    const d = new Date(t);
    const hhmm = d.toTimeString().slice(0, 5);
    const moment = config.moments.find(m => m.at === hhmm && m.days.includes(d.getDay() || 7));
    if (!moment) return null;
    const key = `${d.toDateString()} ${hhmm}`;
    if (state.firedMoments.has(key)) return null;
    state.firedMoments.add(key);
    return moment;
  }

  // The random idle program, runs only while awake.
  function idle(t) {
    if (t >= state.nextGlance && t >= state.lookUntil) {
      const side = Math.random() < 0.5 ? -1 : 1;
      lookAt(side * (0.6 + Math.random() * 0.4), Math.random() * 0.6 - 0.3, t, 2 * SECOND + Math.random() * SECOND);
      state.nextGlance = t + rand(config.glanceEverySeconds);
    }
    if (state.temp && t < state.tempUntil) return;
    state.temp = null;
    const moment = dueMoment(t);
    if (moment) return flash(moment.face, t, moment.minutes * MINUTE);
    const mood = t >= state.nextMood && pickMood();
    if (t >= state.nextMood) state.nextMood = t + rand(config.idleMoodEverySeconds);
    if (mood) {
      flash(mood, t, 3 * SECOND + Math.random() * 2 * SECOND);
    } else if (t >= state.nextBlink) {
      flash('blink', t, 150);
      state.nextBlink = t + rand(config.blinkEverySeconds);
    }
  }

  function current(t) {
    let shown = state.held ?? (state.temp && t < state.tempUntil ? state.temp : state.base);
    const looking = t < state.lookUntil && (state.mode === 'awake' || state.held);
    const turn = looking ? state.look : { x: 0, y: 0 };
    // Only the plain home face moves its eyes; every face turns its head (in CSS).
    if (!state.held && state.mode === 'awake' && shown === state.base && Math.abs(turn.x) > 0.33) {
      shown = config.faces[turn.x < 0 ? 'lookLeft' : 'lookRight']?.[0] ?? shown;
    }
    return { face: shown, mode: state.held ? 'held' : state.mode, turn };
  }

  // kind: 'input' (keyboard, mouse, touch) or 'motion' (PIR sensor)
  function activity(kind, t) {
    state.lastActivity = t;
    if (state.held) return;
    if (!isOpen(t)) {
      if (state.mode === 'asleep' || state.mode === 'brief') setMode('brief', t + 10 * SECOND);
      return;
    }
    if (state.mode !== 'awake') return wake(t);
    if (kind === 'motion' && t - state.lastGreet >= config.greetCooldownSeconds * SECOND) {
      state.lastGreet = t;
      flash('greet', t, 3 * SECOND);
    }
  }

  // Start awake if it is open (someone just started it), otherwise asleep.
  if (isOpen(now)) wake(now);
  else setMode('asleep');
  state.temp = null; // no "surprised" face on start-up

  return {
    activity,

    // Pointer position, -1…1 from the face centre. Holds for 3 s, then the head returns to centre.
    look(x, y, t) {
      if (state.mode === 'awake' || state.held) lookAt(x, y, t, 3 * SECOND);
    },

    // Click/tap: giggle; 3+ pokes within 2 s: dizzy; 6+: flips the table. If asleep, it only wakes up.
    poke(t) {
      const wasAwake = state.mode === 'awake';
      activity('input', t);
      if (!wasAwake || state.held) return;
      state.pokes = [...state.pokes.filter(p => t - p < 2 * SECOND), t];
      if (state.pokes.length >= 6) flash('tableflip', t, 4 * SECOND);
      else if (state.pokes.length >= 3) flash('dizzy', t, 3 * SECOND);
      else flash('giggle', t, 1.5 * SECOND);
    },

    // Someone is typing: listening face until 1.5 s after the last key.
    listen(t) {
      const wasAwake = state.mode === 'awake';
      activity('input', t);
      if (wasAwake && !state.held) flash('listening', t, 1.5 * SECOND);
    },

    // Called by the timer. Returns { face, mode, turn } to show.
    tick(t) {
      if (state.held) return current(t);
      if (state.modeUntil && t >= state.modeUntil) setMode('asleep');
      if (state.mode === 'awake') {
        const idleTooLong = t - state.lastActivity >= config.sleepAfterMinutes * MINUTE;
        if (!isOpen(t) || idleTooLong) setMode('drowsy', t + 6 * SECOND);
        else idle(t);
      }
      return current(t);
    },

    hold(name) { state.held = face(name); },
    auto(t) { state.held = null; state.lastActivity = t; },
    sleep(t) { state.held = null; setMode('drowsy', t + 6 * SECOND); },
    flash,
  };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ---------- View ----------

// Splits a face into the character and its trailing "thought marks" (zzZ, dots, ?, !), which are drawn
// separately so they read as something it thinks or says. "…" becomes three dots that can appear one by one.
function splitMarks(face) {
  const [trail = ''] = face.match(/[\s.…?!zZ]+$/) ?? [];
  return { body: face.slice(0, face.length - trail.length), marks: [...trail.replace(/\s/g, '').replaceAll('…', '...')] };
}

// The marks as small spans: they appear one at a time (staggered start) and jitter a little off centre,
// with new random offsets every round.
function markSpans(marks) {
  const jitter = span => {
    span.style.setProperty('--dx', `${(Math.random() - 0.5) * 0.12}em`);
    span.style.setProperty('--dy', `${(Math.random() - 0.5) * 0.16}em`);
  };
  const box = Object.assign(document.createElement('span'), { className: 'marks' });
  marks.forEach((mark, i) => {
    const span = box.appendChild(Object.assign(document.createElement('span'), { textContent: mark }));
    span.style.animationDelay = `${i * 0.35}s`;
    jitter(span);
    span.addEventListener('animationiteration', () => jitter(span));
  });
  return box;
}

function createView(el) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let shown = el.textContent;
  let shownTurn = '';

  // Shrink faces wider than 85 % of the screen. The margin leaves room for drift, breathing and head turn.
  // scrollWidth is the full text width even when it overflows the screen, and ignores CSS transforms.
  const fit = () => {
    el.style.setProperty('--fit', 1);
    el.style.setProperty('--fit', Math.min(1, (innerWidth * 0.85) / el.scrollWidth).toFixed(3));
  };
  // Measure now, and again once the fonts for this exact text have loaded (before that, the browser
  // measures with a fallback font, which can be much narrower).
  const fitWhenLoaded = text => {
    fit();
    Promise.all(['KaomojiLatin', 'KaomojiCJK'].map(font => document.fonts.load(`1em ${font}`, text))).then(fit);
  };
  addEventListener('resize', fit);
  fitWhenLoaded(shown);

  return ({ face, mode, turn }) => {
    // Only touch the page when something changed: this runs 20 times a second.
    if (document.body.dataset.mode !== mode) document.body.dataset.mode = mode;
    const turnKey = `${turn.x.toFixed(2)} ${turn.y.toFixed(2)}`;
    if (turnKey !== shownTurn) {
      shownTurn = turnKey;
      el.style.setProperty('--turn-x', turn.x.toFixed(2)); // head turn, see #face in mascot.css
      el.style.setProperty('--turn-y', turn.y.toFixed(2));
    }
    if (face === shown) return;
    shown = face;
    const { body, marks } = splitMarks(face);
    el.textContent = body;
    el.dataset.face = body; // the CSS glow layer copies the text from here (the marks glow on their own)
    if (marks.length) el.append(markSpans(marks));
    fitWhenLoaded(face);
    if (!reducedMotion.matches) {
      // a neon tube stuttering as it switches
      el.animate([{ opacity: 0.15 }, { opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 220 });
    }
  };
}

// ---------- Tron blips on the brick wall ----------

// The brick pattern in mascot.css: a 14 × 7 vmin tile at 0 0, i.e. bricks 14 vmin wide in rows 3.5 vmin
// tall, with every other row shifted half a brick. Returns the sizes the blip route is built from.
function brickGrid(width, height) {
  const vmin = Math.min(width, height) / 100;
  const brick = 14 * vmin;
  return { vmin, half: brick / 2, row: 3.5 * vmin, offset: brick / 240 }; // offset: line centre inside the tile
}

// A random route along the mortar from a point A to a point B about 45 vmin away, as points [{x, y}, …].
// Positions are counted on the grid: m = joint number along a line (x = m·half), k = line number
// (y = k·row). Walking along a line there is a joint every half brick, leading either up or down:
// a joint belongs to row r when m and r are both even or both odd. The blip only ever moves towards B.
function blipRoute(width, height, rnd = Math.random) {
  const { half, row, offset } = brickGrid(width, height);
  const lastM = Math.floor(width / half) - 1;
  const lastK = Math.floor(height / row) - 1;
  const inside = (n, last) => Math.max(1, Math.min(last, n));
  const randomSign = () => (rnd() < 0.5 ? -1 : 1);

  // A: anywhere. B: 1–3 rows up or down and 5–6 half bricks sideways (≈ 45 vmin of mortar in all),
  // on the side that fits on the screen.
  let m = 1 + Math.floor(rnd() * lastM);
  let k = 1 + Math.floor(rnd() * lastK);
  const rows = 1 + Math.floor(rnd() * 3);
  const steps = rows === 1 ? 6 : 5;
  let dir = randomSign();
  if (m + dir * steps < 1 || m + dir * steps > lastM) dir = -dir;
  let vdir = randomSign();
  if (k + vdir * rows < 1 || k + vdir * rows > lastK) vdir = -vdir;
  let targetM = inside(m + dir * steps, lastM);
  const targetK = inside(k + vdir * rows, lastK);

  const point = () => ({ x: m * half + offset, y: k * row + offset });
  const route = [point()];
  while (m !== targetM || k !== targetK) {
    const rowsLeft = Math.abs(targetK - k);
    const stepsLeft = Math.abs(targetM - m);
    const jointHere = (k - 1) % 2 === m % 2 ? -1 : 1; // this joint leads up (-1) or down (+1)
    if (rowsLeft && jointHere === Math.sign(targetK - k) && (stepsLeft < 2 * rowsLeft || rnd() < 0.5)) {
      k += jointHere; // take the joint towards B (always, when sideways steps are running out)
    } else if (stepsLeft) {
      m += dir;
    } else if (m + dir >= 1 && m + dir <= lastM) {
      m += dir; // the joint B needs is half a brick further on: move B along rather than turn back
      targetM = m;
    } else {
      break; // at the screen edge: end here
    }
    route.push(point());
  }
  return route;
}

// Draws one blip: a short light trail (glow plus white core, like the sign) that runs along the route.
function blip(svg) {
  const SVG = 'http://www.w3.org/2000/svg';
  const route = blipRoute(innerWidth, innerHeight);
  const trail = 6 * brickGrid(innerWidth, innerHeight).vmin;
  const d = `M${route.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;

  for (const kind of ['glow', 'core']) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    path.classList.add(kind);
    svg.append(path);
    const length = path.getTotalLength();
    // One dash of trail length with a gap longer than the path, slid from before the start to past the end.
    path.style.strokeDasharray = `${trail} ${length + trail}`;
    path.animate([
      { strokeDashoffset: trail, opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { opacity: 1, offset: 0.85 },
      { strokeDashoffset: -length, opacity: 0 },
    ], { duration: 1125, easing: 'linear' }).finished.then(() => path.remove());
  }
}

// ---------- Controller ----------

function start(params) {
  checkConfig();
  const wanted = params.get('color');
  const color = CONFIG.colors[Object.hasOwn(CONFIG.colors, wanted) ? wanted : CONFIG.defaultColor];
  document.documentElement.style.setProperty('--glow', color);

  const faceEl = document.getElementById('face');
  // ?open=always ignores school hours, e.g. for the online demo visited from home in the evening.
  const config = params.get('open') === 'always'
    ? { ...CONFIG, schoolHours: { days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' } }
    : CONFIG;
  const mascot = createMascot(config, Date.now());
  const render = createView(faceEl);
  const update = () => render(mascot.tick(Date.now()));

  if (params.has('face')) mascot.hold(params.get('face'));
  else if (params.get('auto') === 'off') mascot.hold('home');

  addEventListener('keydown', event => {
    const now = Date.now();
    const action = keyAction(event, CONFIG.keys);
    if (action.type === 'auto') {
      mascot.auto(now);
      mascot.activity('input', now);
    } else if (action.type === 'sleep') {
      mascot.sleep(now); // not counted as activity, or it would wake right up again
    } else if (action.type === 'hold') {
      mascot.hold(action.face);
    } else if (action.type === 'listen') {
      mascot.listen(now);
    } else {
      mascot.activity('input', now);
    }
    if (action.shortcut) event.preventDefault(); // our shortcut, not the browser's
    update();
  });

  // Pointer position relative to the face, scaled so the screen edges are about ±1.
  const aim = event => {
    const r = faceEl.getBoundingClientRect();
    const x = (event.clientX - r.left - r.width / 2) / (innerWidth / 2);
    const y = (event.clientY - r.top - r.height / 2) / (innerHeight / 2);
    mascot.look(x, y, Date.now());
  };
  addEventListener('pointermove', event => {
    mascot.activity('input', Date.now());
    aim(event);
    update();
  }, { passive: true });
  addEventListener('pointerdown', event => {
    mascot.poke(Date.now());
    aim(event);
    update();
  });
  addEventListener('wheel', () => mascot.activity('input', Date.now()), { passive: true });

  pollPresence(() => mascot.activity('motion', Date.now()));
  setInterval(update, 50); // fine enough for a 150 ms blink; each tick is a few comparisons
  update();

  // PWA: offline cache and installability. Service workers need http(s), so not from file://.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');

  // Tron blips at random intervals, awake or asleep (CSS dims them with the wall light).
  const blips = document.querySelector('.blips');
  const [blipMin, blipMax] = CONFIG.blipEverySeconds ?? [];
  if (blips && blipMin) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const scheduleBlip = () => setTimeout(() => {
      if (!reducedMotion.matches) blip(blips);
      scheduleBlip();
    }, (blipMin + Math.random() * (blipMax - blipMin)) * SECOND);
    scheduleBlip();
  }

  // For a future prompt app, or the browser console: mascot.setFace('thinking'), mascot.auto()
  window.mascot = {
    setFace(name, ms) { ms ? mascot.flash(name, Date.now(), ms) : mascot.hold(name); update(); },
    auto() { mascot.auto(Date.now()); update(); },
    sleep() { mascot.sleep(Date.now()); update(); },
    blip() { blip(document.querySelector('.blips')); },
  };
}

// Turns a key press into what the mascot should do. Shortcuts need Alt, so ordinary typing never
// triggers them. event.code is the physical key, so Alt+digit works on any keyboard layout.
function keyAction({ key, code, altKey, ctrlKey, metaKey }, keys) {
  const digit = code.match(/^(?:Digit|Numpad)(\d)$/)?.[1];
  if (key === 'Escape' || (altKey && digit === '0')) return { type: 'auto', shortcut: true };
  if (altKey && code === 'KeyS') return { type: 'sleep', shortcut: true };
  if (altKey && Object.hasOwn(keys, digit)) return { type: 'hold', face: keys[digit], shortcut: true };
  if (key.length === 1 && !ctrlKey && !altKey && !metaKey) return { type: 'listen' }; // a typed character
  return { type: 'activity' };
}

// presence.py counts motion events from the PIR sensor. Any change in the count = someone moved.
async function pollPresence(onMotion) {
  if (location.protocol === 'file:') return;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let seen = null;
  while (true) {
    let response;
    try {
      response = await fetch('/presence', { cache: 'no-store' });
    } catch {
      await wait(5 * SECOND); // presence.py not answering, e.g. restarting: try again later
      continue;
    }
    const { motion } = response.ok ? await response.json().catch(() => ({})) : {};
    if (motion === undefined) return; // served by something other than presence.py: no sensor here
    if (seen !== null && motion !== seen) onMotion();
    seen = motion;
    await wait(SECOND);
  }
}

// Warn at start-up about face names in config.js that do not exist (typos). Faces the code itself
// asks for are warned about by createMascot the first time they are used.
function checkConfig() {
  const used = [...Object.keys(CONFIG.idleMoods), ...CONFIG.moments.map(m => m.face), ...Object.values(CONFIG.keys)];
  for (const name of new Set(used)) {
    if (!Object.hasOwn(CONFIG.faces, name) || !CONFIG.faces[name].length) {
      console.warn(`config.js: no face called "${name}" – shows home instead`);
    }
  }
}

// ---------- Self-test: open index.html?test ----------

function runTests() {
  const at = (day, h, m, s = 0) => new Date(2026, 10, day, h, m, s).getTime(); // 23 Nov 2026 is a Monday
  const is = (face, name) => CONFIG.faces[name].includes(face);
  // The tests assume these timings, whatever config.js currently says (e.g. all-day hours while testing).
  const TEST = {
    ...CONFIG,
    schoolHours: { days: [1, 2, 3, 4, 5], from: '07:30', to: '17:00' },
    sleepAfterMinutes: 5,
    greetCooldownSeconds: 60,
    glanceEverySeconds: [10, 25],
    moments: [{ at: '11:30', days: [1, 2, 3, 4, 5], face: 'hungry', minutes: 5 }],
  };
  const results = [];
  const check = (ok, label) => { console.assert(ok, label); results.push(`${ok ? '✓' : '✗ FAIL'}  ${label}`); };

  let m = createMascot(TEST, at(23, 10, 0));
  check(m.tick(at(23, 10, 0)).mode === 'awake', 'starts awake during school hours');
  check(m.tick(at(23, 10, 4, 59)).mode === 'awake', 'still awake after 4 min 59 s');
  check(m.tick(at(23, 10, 5)).mode === 'drowsy', 'drowsy after 5 min without activity');
  check(m.tick(at(23, 10, 5, 7)).mode === 'asleep', 'asleep after yawning');
  m.activity('motion', at(23, 10, 6));
  let v = m.tick(at(23, 10, 6));
  check(v.mode === 'awake' && is(v.face, 'surprised'), 'motion wakes it with a surprised face');
  m.activity('motion', at(23, 10, 6, 10));
  check(is(m.tick(at(23, 10, 6, 10)).face, 'greet'), 'greets a passer-by');
  m.activity('motion', at(23, 10, 6, 40));
  check(!is(m.tick(at(23, 10, 6, 40)).face, 'greet'), 'no second greeting within the cooldown');

  m = createMascot(TEST, at(23, 16, 50));
  m.activity('input', at(23, 16, 59));
  check(m.tick(at(23, 17, 0)).mode === 'drowsy', 'falls asleep when school hours end');

  m = createMascot(TEST, at(23, 20, 0));
  check(m.tick(at(23, 20, 0)).mode === 'asleep', 'starts asleep in the evening');
  m.activity('motion', at(23, 20, 0, 5));
  v = m.tick(at(23, 20, 0, 5));
  check(v.mode === 'brief' && is(v.face, 'groggy'), 'evening motion gives a groggy brief wake');
  check(m.tick(at(23, 20, 0, 16)).mode === 'asleep', 'dozes off again after the brief wake');

  m = createMascot(TEST, at(28, 10, 0));
  check(m.tick(at(28, 10, 0)).mode === 'asleep', 'asleep on a Saturday');
  const always = { ...TEST, schoolHours: { days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' } };
  m = createMascot(always, at(28, 23, 59, 59));
  check(m.tick(at(28, 23, 59, 59)).mode === 'awake', '?open=always: awake on a Saturday night');

  m = createMascot(TEST, at(23, 11, 29, 59));
  check(is(m.tick(at(23, 11, 30)).face, 'hungry'), 'time-of-day moment: hungry at 11:30');

  m = createMascot(TEST, at(23, 10, 0));
  m.hold('party');
  m.activity('motion', at(23, 10, 1));
  check(is(m.tick(at(23, 10, 30)).face, 'party'), 'manual override holds through activity and time');
  m.auto(at(23, 10, 31));
  check(m.tick(at(23, 10, 31)).mode === 'awake', 'Esc returns to automatic');
  m.hold('no-such-face');
  check(is(m.tick(at(23, 10, 32)).face, 'home'), 'unknown face falls back to home');
  m.sleep(at(23, 10, 33));
  check(m.tick(at(23, 10, 33)).mode === 'drowsy', 'Alt+S puts it to sleep');

  m = createMascot(TEST, at(23, 10, 0));
  m.look(0.8, 0, at(23, 10, 0, 1));
  v = m.tick(at(23, 10, 0, 1));
  check(is(v.face, 'lookRight') && v.turn.x > 0, 'pointer to the right: eyes and head turn right');
  v = m.tick(at(23, 10, 0, 5));
  check(!is(v.face, 'lookRight') && v.turn.x === 0, 'head returns to centre after 3 s');
  m.poke(at(23, 10, 0, 6));
  check(is(m.tick(at(23, 10, 0, 6)).face, 'giggle'), 'one click: giggle');
  m.poke(at(23, 10, 0, 6) + 500);
  m.poke(at(23, 10, 0, 7));
  check(is(m.tick(at(23, 10, 0, 7)).face, 'dizzy'), 'three quick clicks: dizzy');
  for (let i = 0; i < 5; i++) m.poke(at(23, 10, 0, 8)); // + the one at :07 = 6 within 2 s
  check(is(m.tick(at(23, 10, 0, 8)).face, 'tableflip'), 'six quick clicks: flips the table');
  m.listen(at(23, 10, 0, 12));
  check(is(m.tick(at(23, 10, 0, 12)).face, 'listening'), 'typing: listening');
  m.hold('party');
  m.listen(at(23, 10, 0, 13));
  check(is(m.tick(at(23, 10, 0, 13)).face, 'party'), 'typing does not break a held face');

  m = createMascot(TEST, at(23, 10, 0));
  let glanced = false;
  for (let s = 0; s <= 26; s++) glanced ||= m.tick(at(23, 10, 0, s)).turn.x !== 0;
  check(glanced, 'glances to the side by itself within 25 s');

  m = createMascot(TEST, at(23, 10, 0));
  m.sleep(at(23, 10, 0));
  m.tick(at(23, 10, 0, 7));
  m.poke(at(23, 10, 1));
  v = m.tick(at(23, 10, 1));
  check(v.mode === 'awake' && is(v.face, 'surprised'), 'click while asleep wakes it, no giggle');

  // Keyboard mapping
  const key = (code, key, mods = {}) => keyAction({ code, key, altKey: false, ctrlKey: false, metaKey: false, ...mods }, TEST.keys);
  let a = key('Digit2', '2', { altKey: true });
  check(a.type === 'hold' && a.face === TEST.keys[2] && a.shortcut, 'Alt+2 holds face 2');
  check(key('Escape', 'Escape').type === 'auto', 'Esc returns to automatic (key mapping)');
  check(key('KeyS', 's', { altKey: true }).type === 'sleep', 'Alt+S sleeps (key mapping)');
  check(key('KeyS', 's').type === 'listen', 'a plain "s" is just typing');
  a = key('KeyR', 'r', { ctrlKey: true });
  check(a.type === 'activity' && !a.shortcut, 'Ctrl+R is left to the browser');

  // A config a teacher might reasonably write must not crash it
  m = createMascot({ ...TEST, idleMoods: {} }, at(23, 10, 0));
  let crashed = false;
  try { for (let s = 0; s <= 60; s++) m.tick(at(23, 10, 0, s)); } catch { crashed = true; }
  check(!crashed, 'no idle moods: keeps running');
  const { home, ...noHome } = TEST.faces;
  m = createMascot({ ...TEST, faces: noHome }, at(23, 10, 0));
  check(typeof m.tick(at(23, 10, 0)).face === 'string', 'no home face: falls back to a built-in face');

  // Tron blips must stay on the mortar lines and on screen, head from A to B without doubling back,
  // and be about 45 vmin long
  for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
    const { vmin, half, row, offset } = brickGrid(w, h);
    const whole = n => Math.abs(n - Math.round(n)) < 1e-6;
    let ok = true;
    let straight = true;
    for (let i = 0; i < 200; i++) {
      const route = blipRoute(w, h);
      let length = 0;
      const dx = new Set(), dy = new Set(); // directions moved in: a route towards B uses one of each
      for (const [p, q] of route.slice(1).map((q, j) => [route[j], q])) {
        if (q.x !== p.x) dx.add(Math.sign(q.x - p.x));
        if (q.y !== p.y) dy.add(Math.sign(q.y - p.y));
        const onScreen = q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= h;
        const k = (Math.min(p.y, q.y) - offset) / row;                  // line index (upper end)
        const mIdx = (p.x - offset) / half;                             // joint index
        const horizontal = p.y === q.y && whole(k);
        const vertical = p.x === q.x && whole(mIdx) && Math.abs(Math.abs(q.y - p.y) - row) < 1e-6
          && Math.round(mIdx) % 2 === Math.round(k) % 2;                // a joint of the row it crosses
        if (!onScreen || !(horizontal || vertical)) ok = false;
        length += Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      }
      if (length < 40 * vmin || length > 55 * vmin) ok = false;
      if (dx.size > 1 || dy.size > 1) straight = false;
    }
    check(ok, `blips stay on the mortar lines, ≈ 45 vmin long (${w}×${h}, 200 random routes)`);
    check(straight, `blips never double back on their way from A to B (${w}×${h})`);
  }

  // Thought marks are split off the face and drawn on their own
  const same = (got, body, marks) => got.body === body && got.marks.join('') === marks;
  check(same(splitMarks('(－ω－) zzZ'), '(－ω－)', 'zzZ'), 'marks: snore Zs split off');
  check(same(splitMarks('(－_－) …?'), '(－_－)', '...?'), 'marks: … becomes three dots, then ?');
  check(same(splitMarks('(°o°)'), '(°o°)', '') && same(splitMarks('(╯°□°)╯︵ ┻━┻'), '(╯°□°)╯︵ ┻━┻', ''), 'marks: faces without marks untouched');

  // AI prompt helpers (prompt.js)
  const parsed = parseChunks('{"message":{"content":"Hej"}}\n{"message":{"content":" där"}}\n{"mess');
  check(parsed.pieces.join('') === 'Hej där' && parsed.rest === '{"mess', 'stream: complete lines read, partial line kept');
  let threw = false;
  try { parseChunks('{"error":"model not found"}\n'); } catch { threw = true; }
  check(threw, 'stream: an Ollama error is raised, not shown as text');
  const box = document.createElement('div');
  box.append(renderMarkdown('Hej **du**\n\n- ett\n- två\n\n```\nlet x = 1;\n```\n<script>alert(1)</script>'));
  check(box.querySelector('p > strong')?.textContent === 'du', 'markdown: **bold**');
  check(box.querySelectorAll('ul > li').length === 2, 'markdown: list');
  check(box.querySelector('pre > code')?.textContent.trim() === 'let x = 1;', 'markdown: code block');
  check(!box.querySelector('script') && box.textContent.includes('<script>'), 'markdown: <script> stays harmless text');

  const failed = results.filter(r => r.startsWith('✗')).length;
  const report = Object.assign(document.createElement('pre'), {
    className: 'test',
    textContent: `${failed ? `${failed} FAILED` : 'All tests passed'}\n\n${results.join('\n')}`, // text, never HTML
  });
  document.body.replaceChildren(report);
}

// config.js is edited by hand. If it has a typo, say so on screen instead of showing a frozen face.
// This script loads before config.js, so it sees the error and where it is.
let configError = '';
addEventListener('error', event => {
  // From file:// some browsers hide the details (line 0, "Script error."): then just name the file.
  if (event.filename?.endsWith('/config.js') && event.lineno) configError = ` kring rad ${event.lineno} (${event.message})`;
});

addEventListener('DOMContentLoaded', () => {
  if (typeof CONFIG === 'undefined') {
    document.body.append(Object.assign(document.createElement('p'), {
      className: 'config-error',
      role: 'alert',
      textContent: `config.js har ett fel${configError}. Rätta felet och ladda om sidan.`,
    }));
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has('test')) runTests();
  else start(params);
});
