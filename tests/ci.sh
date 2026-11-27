#!/bin/sh
# The checks GitHub Actions runs on every push (.github/workflows/ci.yml). No Ollama needed.
# Locally: CHROME="flatpak run io.github.ungoogled_software.ungoogled_chromium" tests/ci.sh
set -eu
cd "$(dirname "$0")/.."

echo "Syntax"
for file in *.js tests/*.mjs; do node --check "$file"; done
python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])' presence.py

echo "Offline file list"
node tests/check-sw.mjs

echo "Self-test (index.html?test)"
python3 presence.py --port 8123 > /dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
until curl -s -o /dev/null http://127.0.0.1:8123/presence; do sleep 0.2; done
# --no-sandbox: CI runners block Chromium's sandbox; the page is our own.
page=$(${CHROME:-chromium} --headless=new --no-sandbox --dump-dom "http://127.0.0.1:8123/?test" 2> /dev/null)
echo "$page" | grep -E '✓|✗' | sed 's/<[^>]*>//g'
echo "$page" | grep -q 'All tests passed'
