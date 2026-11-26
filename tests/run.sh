#!/bin/sh
# Browser tests for the PWA, the AI chat and the accessibility fixes, driven over the Chrome DevTools
# Protocol. Needs: Node 22+, Ungoogled Chromium (Flatpak) and Ollama with the model from config.js.
# Usage: tests/run.sh [pwa|chat|a11y] (default: chat). Screenshots end up in tests/out/.
# Note: the page keeps the model loaded (keepAlive -1); this script unloads it again afterwards.
set -eu
cd "$(dirname "$0")/.."
test="${1:-chat}"
mkdir -p tests/out
python3 presence.py --port 8000 > /dev/null 2>&1 &
server=$!
until curl -s -o /dev/null http://127.0.0.1:8000/presence; do sleep 0.3; done
profile=$(mktemp -d)
url="http://127.0.0.1:8000/?open=always"
[ "$test" = pwa ] && url="https://tcstenungsund.github.io/mascot/?open=always"
flatpak run io.github.ungoogled_software.ungoogled_chromium --headless=new --remote-debugging-port=9333 \
  --user-data-dir="$profile" --no-first-run --window-size=1280,800 "$url" > /dev/null 2>&1 &
browser=$!
until curl -s -o /dev/null http://127.0.0.1:9333/json/version; do sleep 0.5; done
case "$test" in
  pwa) node tests/pwa-check.mjs ;;
  chat) IDLE=8000 node tests/chat-e2e.mjs tests/out ;;
  a11y) IDLE=8000 node tests/a11y-e2e.mjs tests/out ;;
esac || true
kill "$browser" "$server" 2> /dev/null || true
flatpak kill io.github.ungoogled_software.ungoogled_chromium 2> /dev/null || true
rm -rf "$profile"
model=$(grep -o "model: '[^']*'" config.js | cut -d"'" -f2)
curl -s http://127.0.0.1:11434/api/generate -d "{\"model\":\"$model\",\"keep_alive\":0}" > /dev/null || true
