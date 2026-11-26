// Checks the accessibility fixes and the CSP in a running Chromium (remote debugging on port 9333).
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.method === 'Log.entryAdded') logs.push(`${m.params.entry.level}: ${m.params.entry.text}`);
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  pending.get(m.id)?.(m.result ?? m.error);
};
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await new Promise(r => (ws.onopen = r));
const wait = ms => new Promise(r => setTimeout(r, ms));
const js = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true })).result.value;
const shot = async name => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
const key = (key, code, text, vk) => Promise.all(['keyDown', 'keyUp'].map(type =>
  send('Input.dispatchKeyEvent', { type, key, code, text: type === 'keyDown' ? text : undefined, windowsVirtualKeyCode: vk })));
const check = (ok, label) => console.log(`${ok ? '✓' : '✗ FAIL'}  ${label}`);

// Capture everything from a fresh load, including CSP violations during loading.
await send('Log.enable');
await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await wait(Number(process.env.IDLE ?? 4000));

check(await js('!document.querySelector(".hint").hidden && getComputedStyle(document.querySelector(".hint")).display !== "none"'), 'hint shown on the screensaver (AI available)');
await js('new Promise(r => setTimeout(r, 0))');
await send('Runtime.evaluate', { expression: 'document.querySelector(".hint").getAnimations()[0].currentTime = 4000' }); // at full strength for the shot
await shot('1-hint');

await js('CONFIG.chat.closeAfterMinutes = 0.6'); // 36 s, so the warning comes 6 s after the last activity
await key('V', 'KeyV', 'V', 86);
await send('Input.insertText', { text: 'ad är HTML? En mening.' });
check(await js('getComputedStyle(document.querySelector(".hint")).display === "none"'), 'hint hidden while chatting');
check(await js('getComputedStyle(document.body).cursor === "auto"'), 'mouse pointer visible in chat mode (cursor: auto)');
check(await js('getComputedStyle(document.querySelector(".chat form")).borderBottomColor') === 'rgb(199, 0, 102)', 'input underline in full rosa');

await key('Enter', 'Enter', '\r', 13);
const busy = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  busy.add(await js('document.querySelector(".log").getAttribute("aria-busy")'));
  if (busy.has('true') && await js('document.querySelector(".log").getAttribute("aria-busy")') === 'false') break; // answer complete
  await wait(50);
}
check(busy.has('true'), `answer area marked aria-busy="true" while streaming (seen: ${[...busy].join(', ')})`);
check(await js('document.querySelector(".log").getAttribute("aria-busy")') === 'false', 'aria-busy back to "false" when the answer is complete');
console.log('   answer:', JSON.stringify(await js('document.querySelector(".answer").innerText')));
check(await js('document.querySelector(".chat footer").getAttribute("role")') === 'status', 'footer is a status line (warning gets announced)');

await wait(8000); // past the 6 s mark
const warning = await js('document.querySelector(".chat footer").textContent');
check(warning.startsWith('Rensas om 30 sekunder') && await js('document.querySelector(".chat footer").classList.contains("warn")'), `warning shown before the wipe: "${warning}"`);
await shot('2-warning');
await key('Shift', 'ShiftLeft', undefined, 16);
await wait(200);
check((await js('document.querySelector(".chat footer").textContent')).startsWith('Lokal AI'), 'any key (Shift) cancels the warning and keeps the chat');
check(await js('!document.querySelector(".chat").hidden') && await js('document.querySelector(".log").children.length') === 2, 'conversation still there after extending');

const csp = logs.filter(l => /Content Security Policy|Refused to/i.test(l));
check(csp.length === 0, `no CSP violations (${csp.length})${csp.length ? '\n   ' + csp.join('\n   ') : ''}`);
const errors = logs.filter(l => /^(error|exception)/.test(l) && !csp.includes(l));
check(errors.length === 0, `no other errors in the console (${errors.length})${errors.length ? '\n   ' + errors.join('\n   ') : ''}`);
ws.close();
