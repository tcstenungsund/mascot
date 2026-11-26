// Asks a running Chromium (remote debugging on port 9333) whether the open page is an installable PWA.
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  pending.get(msg.id)?.(msg.result ?? msg.error);
};
const send = (method, params = {}) => new Promise(resolve => {
  pending.set(++id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise(resolve => (ws.onopen = resolve));

const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(4000); // let the page load and the service worker install

const manifest = await send('Page.getAppManifest');
console.log('manifest url:', manifest.url, '| parse errors:', manifest.errors?.length ?? 0);
const { installabilityErrors } = await send('Page.getInstallabilityErrors');
console.log('installability errors:', installabilityErrors.length ? JSON.stringify(installabilityErrors) : 'none – installable');
const sw = await send('Runtime.evaluate', {
  expression: 'navigator.serviceWorker.getRegistration().then(r => r?.active?.state ?? "none")',
  awaitPromise: true,
});
console.log('service worker:', sw.result.value);
const cached = await send('Runtime.evaluate', {
  expression: 'caches.open("mascot-v1").then(c => c.keys()).then(k => k.length)',
  awaitPromise: true,
});
console.log('cached files:', cached.result.value);
ws.close();
