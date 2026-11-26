// End-to-end test of the AI prompt in a running Chromium (remote debugging on port 9333).
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); pending.get(m.id)?.(m.result ?? m.error); };
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await new Promise(r => (ws.onopen = r));
const wait = ms => new Promise(r => setTimeout(r, ms));
const js = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true })).result.value;
const shot = async name => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
const key = (key, code, text, vk) => Promise.all(['keyDown', 'keyUp'].map(type =>
  send('Input.dispatchKeyEvent', { type: type === 'keyDown' && text ? 'keyDown' : type, key, code, text: type === 'keyDown' ? text : undefined, windowsVirtualKeyCode: vk })));

await wait(Number(process.env.IDLE ?? 3000)); // page sits as a screensaver (the model loads meanwhile)
console.log('chat hidden before typing:', await js('document.querySelector(".chat").hidden'));

// First key opens the chat and must land in the input; the rest is typed into it.
await key('V', 'KeyV', 'V', 86);
await send('Input.insertText', { text: 'ad är en algoritm? Svara kort med en punktlista.' });
console.log('chat open:', await js('!document.querySelector(".chat").hidden'), '| input:', JSON.stringify(await js('document.querySelector(".chat input").value')));
await shot('1-typing');

// Send, and record the face every 100 ms while the answer streams.
await key('Enter', 'Enter', '\r', 13);
const faces = [];
let screenshotTaken = false;
const start = Date.now();
while (Date.now() - start < 60000) {
  const f = await js('document.getElementById("face").textContent');
  if (faces.at(-1) !== f) faces.push(f);
  if (!screenshotTaken && f === '(・o・)') { await shot('2-streaming'); screenshotTaken = true; }
  if (faces.includes('(＾▽＾)') || faces.includes('(＾‿＾)') || faces.includes('(・_・;)')) break;
  await wait(100);
}
console.log(`face sequence (${((Date.now() - start) / 1000).toFixed(1)} s):`, faces.join('  →  '));
await wait(500);
await shot('3-answered');
console.log('answer:', JSON.stringify(await js('document.querySelector(".answer").innerText')));
console.log('formatted elements:', await js('[...document.querySelectorAll(".answer *")].map(e => e.tagName).join(",")'));

// Esc wipes the conversation and brings the sign back.
await key('Escape', 'Escape', undefined, 27);
await wait(800);
console.log('after Esc: hidden', await js('document.querySelector(".chat").hidden'), '| log entries', await js('document.querySelector(".log").children.length'), '| data-chat', await js('"chat" in document.body.dataset'));
await shot('4-after-esc');
ws.close();
