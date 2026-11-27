'use strict';
// Local AI prompt. When someone starts typing, the sign moves up and a terminal-style chat with the local
// Ollama model appears below it. The mascot's face shows what the AI is doing. Esc, or a few minutes
// without use, wipes the conversation and the mascot goes back to being a screensaver.
//
// Only switches itself on when the page is served from this computer (http://127.0.0.1 or localhost)
// and Ollama answers. Online (GitHub Pages), from file:// or on the Pi it never appears.
// Loaded before mascot.js so the self-test can use the helpers; starts on DOMContentLoaded, when
// mascot.js has set up window.mascot.

// ---------- Helpers (no page access, tested in index.html?test) ----------

// Ollama streams one JSON object per line. Returns the text pieces of the complete lines, and the
// unfinished last line to keep for the next chunk.
function parseChunks(buffer) {
  const lines = buffer.split('\n');
  const rest = lines.pop();
  const pieces = lines.filter(line => line.trim()).map(line => {
    const data = JSON.parse(line);
    if (data.error) throw new Error(data.error);
    return data.message?.content ?? '';
  });
  return { pieces, rest };
}

// A small Markdown subset → page elements: paragraphs, # headings, **bold**, `code`, fenced code blocks
// and - / 1. lists. Built only with createElement and textContent, never innerHTML, so whatever the
// model writes (even <script>) is shown as text and can never run.
function renderMarkdown(text) {
  const el = tag => document.createElement(tag);
  const inline = line => {
    const out = document.createDocumentFragment();
    for (const part of line.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        out.append(Object.assign(el('strong'), { textContent: part.slice(2, -2) }));
      } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        out.append(Object.assign(el('code'), { textContent: part.slice(1, -1) }));
      } else {
        out.append(part);
      }
    }
    return out;
  };

  const result = document.createDocumentFragment();
  let paragraph = null;
  let list = null;
  let code = null;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      if (code) {
        code = null;
      } else {
        const pre = el('pre');
        code = pre.appendChild(el('code'));
        result.append(pre);
        paragraph = list = null;
      }
      continue;
    }
    if (code) {
      code.textContent += `${line}\n`;
      continue;
    }
    const item = line.match(/^\s*([-*]|\d+\.)\s+(.*)/);
    if (item) {
      const type = /\d/.test(item[1]) ? 'OL' : 'UL';
      if (list?.tagName !== type) list = result.appendChild(el(type.toLowerCase()));
      list.appendChild(el('li')).append(inline(item[2]));
      paragraph = null;
      continue;
    }
    if (!line.trim()) {
      paragraph = list = null;
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)/);
    if (heading) {
      result.appendChild(el('p')).appendChild(el('strong')).append(inline(heading[1]));
      paragraph = list = null;
      continue;
    }
    if (paragraph) paragraph.append(el('br'));
    else paragraph = result.appendChild(el('p'));
    paragraph.append(inline(line));
    list = null;
  }
  return result;
}

// ---------- The chat ----------

async function startChat() {
  const chat = document.querySelector('.chat');
  if (!chat || !['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  const { ollama, model, systemPrompt, keepAlive } = CONFIG.chat;
  try {
    const response = await fetch(`${ollama}/api/version`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return;
  } catch {
    return; // no Ollama on this computer: the mascot stays a mascot
  }
  // Load the model into memory now (an empty chat only loads it), so the first visitor does not wait for
  // gigabytes to load. Sent again when the chat opens, in case Ollama unloaded it in the meantime.
  const loadModel = () => fetch(`${ollama}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model, messages: [], keep_alive: keepAlive, think: false }),
  }).catch(() => {});
  loadModel();

  const log = chat.querySelector('.log');
  const form = chat.querySelector('form');
  const input = chat.querySelector('input');
  const footer = chat.querySelector('footer');
  const footerText = footer.textContent;
  let history = [];       // the conversation, only in memory
  let generation = null;  // AbortController for the answer being written
  let closeTimer = 0;
  let warnTimer = 0;
  let afterTimer = 0;

  // Tell people the chat exists: a hint line on the screensaver (hidden again while chatting, by CSS).
  document.querySelector('.hint').hidden = false;

  const isOpen = () => !chat.hidden;
  const face = name => window.mascot.setFace(name); // holds the face while the chat is open

  // Restart the countdown to the wipe. 30 s before, the footer warns (and screen readers announce it,
  // the footer is a status line), so a slow reader is never cut off without notice: any key extends.
  const WARN_MS = 30_000;
  const keepOpen = () => {
    clearTimeout(closeTimer);
    clearTimeout(warnTimer);
    footer.textContent = footerText;
    footer.classList.remove('warn');
    const ms = CONFIG.chat.closeAfterMinutes * 60_000;
    closeTimer = setTimeout(close, ms);
    warnTimer = setTimeout(() => {
      footer.textContent = 'Rensas om 30 sekunder – tryck valfri tangent för att stanna kvar';
      footer.classList.add('warn');
    }, Math.max(0, ms - WARN_MS));
  };

  function open() {
    chat.hidden = false;
    document.body.dataset.chat = '';
    face('listening');
    loadModel();
    keepOpen();
  }

  // Wipes everything, so the next person never sees the previous conversation.
  function close() {
    generation?.abort();
    clearTimeout(closeTimer);
    clearTimeout(warnTimer);
    clearTimeout(afterTimer);
    footer.textContent = footerText;
    footer.classList.remove('warn');
    history = [];
    log.replaceChildren();
    input.value = '';
    input.blur();
    chat.hidden = true;
    delete document.body.dataset.chat;
    window.mascot.auto();
  }

  async function ask(question) {
    history.push({ role: 'user', content: question });
    log.appendChild(Object.assign(document.createElement('p'), { className: 'you', textContent: question }));
    const answer = log.appendChild(Object.assign(document.createElement('div'), { className: 'answer' }));
    clearTimeout(afterTimer);
    face('thinking');
    // Busy while streaming, so screen readers read the answer once when it is complete instead of
    // announcing every fragment as the text is rebuilt.
    log.setAttribute('aria-busy', 'true');
    generation = new AbortController();
    let text = '';
    let mouthOpen = false;
    let lastMouth = 0;
    let drawing = false;
    const draw = () => {
      drawing = false;
      answer.replaceChildren(renderMarkdown(text));
      log.scrollTop = log.scrollHeight;
    };
    try {
      const response = await fetch(`${ollama}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          keep_alive: keepAlive,
          think: false, // thinking models (Gemma 4) would otherwise reason silently for ~20 s first
          messages: [{ role: 'system', content: systemPrompt }, ...history],
        }),
        signal: generation.signal,
      });
      if (!response.ok) throw new Error(`Ollama: ${response.status}`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parsed = parseChunks(buffer + value);
        buffer = parsed.rest;
        text += parsed.pieces.join('');
        // The mouth moves while words arrive: talking ↔ home, at most every 120 ms.
        if (performance.now() - lastMouth > 120) {
          mouthOpen = !mouthOpen;
          face(mouthOpen ? 'talking' : 'home');
          lastMouth = performance.now();
        }
        if (!drawing) {
          drawing = true;
          requestAnimationFrame(draw);
        }
        keepOpen();
      }
      draw();
      history.push({ role: 'assistant', content: text });
      face('happy');
      afterTimer = setTimeout(() => isOpen() && face('listening'), 2000);
    } catch (error) {
      if (error.name === 'AbortError') return; // closed with Esc
      history.pop(); // the question got no answer; leave it out of the conversation
      answer.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'error',
        textContent: 'Hoppsan, jag får ingen kontakt med AI-modellen just nu. Försök igen om en stund.',
      }));
      face('nervous');
    } finally {
      generation = null;
      log.setAttribute('aria-busy', 'false');
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || generation) return;
    input.value = '';
    keepOpen();
    ask(question);
  });

  addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (isOpen()) close();
      return;
    }
    if (isOpen()) keepOpen(); // any key keeps the chat open, as the warning promises
    const typing = event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (!typing) return;
    if (!isOpen()) open();
    // Moving focus during keydown makes this very key land in the input (also after a click elsewhere).
    if (document.activeElement !== input) input.focus();
    keepOpen();
  });
}

addEventListener('DOMContentLoaded', startChat);
