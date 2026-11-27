# Roadmap and notes

Status as of 2026-11-26. What is done is described in the [README](README.md); this file is what is left,
what is untested, and what is worth knowing before the next round.

## Next steps

- **Name the mascot.** A good task for the pupils. Then add the name to `chat.systemPrompt` in `config.js`,
  and consider a Montserrat wordmark (the school's typeface) for print and TikTok.
- **Lock down the kiosk browser** (security audit, finding 1). In kiosk mode Chromium can still open developer
  tools (Ctrl+Shift+I), and from there anyone at the keyboard can use Ollama's whole API (delete models,
  download new ones until the disk is full) or browse anywhere. Fix with a policy file on each kiosk, e.g.
  `/etc/chromium/policies/managed/mascot.json`:
  `{"DeveloperToolsAvailability": 2, "URLBlocklist": ["*"], "URLAllowlist": ["127.0.0.1:8000"]}`.
  Check the exact path for the Chromium build used (Raspberry Pi OS / Flatpak differ), test, add to README.
- **Try it on the real Raspberry Pi 5.** Not tested yet: animation smoothness (glow, 3D head turn, blips),
  the PIR sensor, the labwc autostart, Chromium kiosk mode, and screen blanking. If the Pi struggles, the
  `filter: blur()` on the glow layer is the first thing to simplify.
- **Tune the AI.** Switched to `gemma4:12b` (fluent Swedish; Qwen 2.5 7B made up words) with `think: false`.
  `chat.systemPrompt` now holds the school facts from the autumn 2026 brochures (`contextTokens: 8192` makes room). Try real
  questions with pupils, check it admits what it doesn't know, and update the facts when the offer changes.
  Keep the "Lokal AI – kan ha fel" footer whatever the model.
- **Test print** `mascot.svg` before ordering a roll-up: neon glow is much weaker in CMYK than on screen.

## Ideas, not decided

- **Touch to chat** (accessibility audit, finding 6): only needed if a kiosk gets a touchscreen without a
  keyboard. A tap would open the chat and focus the input so the on-screen keyboard appears.
- **Special-date calendar**: faces for Lucia, Christmas, exam week, open house, summer break (skipped in v1).
- **More AI states**: `shrug` when the model says it does not know, `determined` for long answers.
- **A name tag / wordmark under the sign**, once the mascot has a name.

## Known quirks

- After Esc (or a held `?face=`) the mascot sometimes plays a random mood right away: moods are paused while
  a face is held, so one is overdue. It reads like a goodbye, so it was left as is.
- On GitHub Pages the mascot follows the visitor's clock, so evenings and weekends it sleeps. Share the link
  with `?open=always`.
- `chat.keepAlive: -1` keeps the model in graphics memory (~6 GB) for good. Use `'30m'` if the computer is
  used for anything else.

## Things to keep in mind

- **Changing Ollama's address** (`chat.ollama`) also needs `connect-src` in the Content Security Policy at the
  top of `index.html`, or the browser blocks the chat.
- **Adding or removing files** needs the list in `sw.js` updated and `VERSION` bumped.
- **New faces**: check them with `index.html?face=<name>`. Glyphs outside the bundled font ranges fall back
  to a system font. To add ranges, re-subset the Noto fonts with `pyftsubset` (fontTools).
- **Shared web origin**: all GitHub Pages sites in the `tcstenungsund` organisation share
  `tcstenungsund.github.io`, so any of them can read or replace the mascot's offline cache. Fine as long as only
  trusted people can publish Pages there; a separate domain would remove the risk.
- **Commit e-mail**: the commits so far carry a personal address. Use GitHub's "noreply" address for future
  commits (GitHub → Settings → Emails, then `git config user.email`).
- **GERTY** from *Moon* inspired the idea; never copy its actual screen faces.

## Testing

- `index.html?test`: the behaviour self-test (state machine, keys, config edge cases, blip routes, the
  chat's stream parser and Markdown formatter). Runs in any browser, also from `file://`.
- `tests/run.sh chat|a11y|pwa`: browser tests over the Chrome DevTools Protocol (Node 22+, Ungoogled Chromium
  Flatpak, local Ollama). `chat` asks a real question and records the faces; `a11y` checks the accessibility
  fixes and that there are no CSP violations; `pwa` checks the live site is installable. The script unloads
  the model afterwards.
- Not tested: a real screen reader (Orca), 400 % zoom, the Chromium install dialog, the Raspberry Pi.
