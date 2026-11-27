# Neon kaomoji mascot

The AI mascot for Informations- och medieteknik / Informationsteknik, Teknikprogrammet, Nösnäsgymnasiet.
It is a neon-sign kaomoji that breathes, blinks, changes mood, greets passers-by, and falls asleep when
nobody is around.

**Live:** https://tcstenungsund.github.io/mascot/?open=always (online it runs without the motion sensor;
`?open=always` keeps it on school-day behaviour whatever the visitor's clock says).

## Files

| File | What it is |
|------|-----------|
| `index.html`, `mascot.css`, `mascot.js` | The live mascot |
| `prompt.js` | The local AI prompt (chat with Ollama on this computer) |
| `config.js` | **Edit this one**: faces, colours, school hours, sleep delay, daily moments, keys, AI model and system prompt |
| `presence.py` | Small local server and motion-sensor bridge (Raspberry Pi) |
| `mascot.svg` | Print master (text already converted to paths) |
| `fonts/` | Noto Sans subsets for the kaomoji glyphs, SIL OFL 1.1 (see `fonts/OFL.txt`) |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: app name and icons, offline cache |
| `tests/` | Browser tests for the chat, accessibility and PWA (`tests/run.sh`) |
| `ROADMAP.md` | Next steps, ideas, known quirks and things to keep in mind |

## Try it

Open `index.html` in Firefox. That's all; it runs from the file. Useful URLs:

- `index.html?face=happy`: hold one face (any name from `config.js`)
- `index.html?color=bla`: glow colour: `rosa` (default), `bla`, `gron`, `gul`
- `index.html?auto=off`: just the home face, no random program
- `index.html?open=always`: ignore school hours, always behave as during the school day (for demos)
- `index.html?test`: runs the behaviour self-test

Motion only works when the page is served by `presence.py` (below).

## Behaviour

- **School hours** (Mon–Fri 07:30–17:00): awake. It blinks, and now and then shows a random mood.
  At set times it shows a special face (yawn 08:00, hungry 11:30, party Friday 15:00). Someone walking past
  gets a wave, at most once a minute.
- **5 minutes** with no input or motion: it yawns, dims, and falls asleep. Input or motion wakes it.
- **Outside school hours:** asleep. Motion gives a short groggy "…?" before it dozes off again.

## Interacting with it

Only while it is awake (during school hours). Outside them, any input just gets the groggy face.

| You do | It does |
|--------|---------|
| Move the mouse | Eyes and head turn toward the pointer (3D tilt), back to centre after 3 s |
| Click / tap | Giggles `(≧▽≦)`; 3+ quick clicks make it dizzy `(@_@)`; 6+ and it flips the table |
| Type ordinary keys | Listens `(・ω・)…` |
| Nothing | Glances around by itself every 10–25 s, blinks, shows random moods. Every 1–2 min a Tron light zips along the bricks (dimmer while asleep; `blipEverySeconds` in `config.js`) |

## Keyboard shortcuts

| Key | Does |
|-----|------|
| `Alt`+`1`–`9` | Hold a face: home, happy, greet, thinking, surprised, party, wink, shrug, cool (mapping in `config.js`) |
| `Esc` / `Alt`+`0` | Back to automatic |
| `Alt`+`S` | Sleep now |

The shortcuts use Alt so that ordinary typing only makes it listen.
To try the daytime behaviour in the evening, temporarily set `schoolHours` in `config.js` to
`days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '23:59'`.

## Raspberry Pi 5 setup

1. **Wire a PIR sensor** (e.g. HC-SR501): VCC → pin 2 (5 V), GND → pin 6, OUT → pin 11 (GPIO17).
   The HC-SR501's output is 3.3 V, so it is safe for the Pi. Point it at the walkway, not at a window
   or a radiator.
2. **Copy this folder** to the Pi, e.g. `~/mascot`.
3. **Set the time zone**, or school hours run an hour off:
   `sudo raspi-config` → Localisation Options → Timezone → Europe → Stockholm.
   Check with `date`.
4. **Test:** `python3 ~/mascot/presence.py`, then open `http://127.0.0.1:8000` in Chromium and wave.
   `curl 127.0.0.1:8000/presence` should count up. `gpiozero` comes with Raspberry Pi OS.
5. **Autostart:** add these lines to `~/.config/labwc/autostart` (create the file if it is missing):

   ```sh
   python3 /home/pi/mascot/presence.py &
   # Open the browser only once the server answers; a fixed delay can be too short on a cold boot.
   (until curl -s http://127.0.0.1:8000/presence > /dev/null; do sleep 1; done
    chromium --kiosk --noerrdialogs --disable-infobars http://127.0.0.1:8000) &
   ```

   Adjust `/home/pi` to the real user. On older images the browser command is `chromium-browser`.
6. **Screen blanking off:** Raspberry Pi Configuration → Display → Screen Blanking: off
   (or `sudo raspi-config` → Display Options → Screen Blanking).

The server only listens on 127.0.0.1, so other devices on the school network cannot reach it.

## Other uses

- **Local-LLM computer:** same as the Pi, minus the sensor. Run it in kiosk mode, e.g.
  `firefox --kiosk file:///path/to/mascot/index.html`. Without a sensor it wakes on keyboard and mouse.
  A future prompt app can drive it with `mascot.setFace('thinking')` and `mascot.auto()`.
  `mascot.blip()` in the browser console fires a Tron blip on cue, e.g. for a TikTok shot.
- **TikTok / video:** record the browser window with OBS Studio (GPL) at 1080×1920. Use Firefox Responsive
  Design Mode (Ctrl+Shift+M) for an exact 9:16 window, and Alt+number to change face on cue.
- **Print / roll-up:** `mascot.svg` is vector with the text as paths; scale it freely in Inkscape or
  Scribus. Neon glow looks much weaker in CMYK than on screen, so do a test print first.


## Local AI prompt

On a computer running [Ollama](https://ollama.com) (MIT licence), the mascot is also the face of a local AI.
Start typing and the sign moves up to make room for a chat; the mascot thinks, "talks" while the answer
streams in, and looks happy when it is done.

1. Install a model, e.g. `ollama pull gemma4:12b` (the default in `config.js`, about 8 GB; it writes much better
   Swedish than e.g. Qwen 2.5 7B, which makes up words).
2. Run `python3 presence.py` and open `http://127.0.0.1:8000` (kiosk mode as above). The prompt only exists
   there: from `file://`, online and on a computer without Ollama the mascot is just a mascot.
3. Change `chat.model` or `chat.systemPrompt` in `config.js` to change the model or the mascot's personality.
   If you change `chat.ollama` (Ollama's address), change `connect-src` in the Content Security Policy at the
   top of `index.html` to match, or the browser blocks the chat.

- **Privacy:** the conversation lives only in the page's memory. Esc, or 5 minutes without use, wipes it and
  the mascot goes back to being a screensaver. Nothing is stored and nothing leaves the computer. 30 seconds
  before the wipe, the footer warns, and any key keeps the chat open.
- **Accessibility:** a hint under the sign tells visitors they can type to chat. Screen readers get each
  answer once it is complete, and the wipe warning is announced.
- **Speed:** the page loads the model when it starts and keeps it in memory (`chat.keepAlive: -1`), so
  answers start within a second instead of after a ~30 s load. This uses about 8 GB of graphics memory.
- **It can be wrong:** a small local model makes mistakes and the system prompt only steers it. The screen
  says so ("Lokal AI – kan ha fel").

## Install as an app (PWA)

The mascot is a Progressive Web App: it can be installed like an app, opens fullscreen with its own
icon, and keeps working when the server is down (it then runs from its offline copy, without motion).

1. Serve it with `python3 presence.py` (also works without a sensor). A PWA needs `http://`, so opening
   `index.html` as a file works but cannot be installed or run offline.
2. Open `http://127.0.0.1:8000` in Chromium and click the install icon in the address bar.
   Firefox can't install web apps on Linux. GNOME Web (Epiphany) can.

Edits to `config.js` and the other files show up on the next reload: the offline copy is only used when the
server does not answer. If you add or remove files, add them to the list in `sw.js` and change `VERSION` there.

## Adding faces

Add a line under `faces` in `config.js`. The bundled fonts cover Latin, Greek, Cyrillic, kana, fullwidth forms,
box drawing, arrows and common symbols. A glyph outside those ranges falls back to a system font and
may look off. Check every new face with `index.html?face=<name>`.

## Licence

Everything in this repo except `fonts/`: [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). You may use, change and share
it, but changed versions, including ones only run on a server for others to use, must be shared under the same
licence. The bundled fonts in `fonts/` are Noto Sans subsets under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
