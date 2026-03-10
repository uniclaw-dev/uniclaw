#!/bin/bash
# Start headless Chrome for UniClaw

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HEADLESS_PORT=9223
CHROME_PORT=9222
HEADLESS_PROFILE="$HOME/.chrome-headless-slack"
COOKIES_FILE="$SCRIPT_DIR/slack-cookies.json"

# Force flag
FORCE=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE=true
fi

# Check if already running
if curl -s "http://127.0.0.1:$HEADLESS_PORT/json/version" > /dev/null 2>&1; then
    if [ "$FORCE" = false ]; then
        echo "Chrome already running on port $HEADLESS_PORT"
        exit 0
    fi
    echo "Killing existing Chrome on port $HEADLESS_PORT..."
    pkill -f "chrome.*$HEADLESS_PORT" 2>/dev/null
    sleep 2
fi

# Export cookies from debug Chrome
if curl -s "http://127.0.0.1:$CHROME_PORT/json/version" > /dev/null 2>&1; then
    echo "Exporting cookies from port $CHROME_PORT..."
    node "$SCRIPT_DIR/export-cookies.js"
    if [ $? -ne 0 ]; then
        echo "WARNING: Failed to export cookies"
    fi
else
    echo "WARNING: Debug Chrome not running on port $CHROME_PORT"
fi

# Start Chrome
echo "Starting Chrome on port $HEADLESS_PORT..."
rm -rf "$HEADLESS_PROFILE"
mkdir -p "$HEADLESS_PROFILE"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new \
    --remote-debugging-port=$HEADLESS_PORT \
    --user-data-dir="$HEADLESS_PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    > /dev/null 2>&1 &

sleep 3

# Verify it started
for i in {1..10}; do
    if curl -s "http://127.0.0.1:$HEADLESS_PORT/json/version" > /dev/null 2>&1; then
        echo "Chrome started on port $HEADLESS_PORT"
        break
    fi
    sleep 1
done

if ! curl -s "http://127.0.0.1:$HEADLESS_PORT/json/version" > /dev/null 2>&1; then
    echo "ERROR: Chrome failed to start"
    exit 1
fi

# Import cookies and navigate to Slack
if [ -f "$COOKIES_FILE" ]; then
    echo "Importing cookies..."
    node "$SCRIPT_DIR/import-cookies.js"
fi

# Navigate to mengfj DM
echo "Navigating to mengfj DM..."
sleep 2

node -e "
const WebSocket = require('ws');
const http = require('http');

http.get('http://127.0.0.1:$HEADLESS_PORT/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const pages = JSON.parse(data);
    const page = pages.find(p => p.type === 'page');
    if (!page) {
      console.log('No page found');
      process.exit(1);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: \`
            (() => {
              const items = document.querySelectorAll('.p-channel_sidebar__channel, [data-qa-channel-sidebar-type=\"im\"]');
              for (const item of items) {
                if (item.innerText.toLowerCase().includes('mengfj')) {
                  item.click();
                  return 'clicked: ' + item.innerText.trim();
                }
              }
              // Try navigating directly via URL
              window.location.href = 'https://app.slack.com/client/T454XGSPR/D44BZGKDZ';
              return 'navigating directly';
            })()
          \`
        }
      }));
    });
    ws.on('message', (data) => {
      const result = JSON.parse(data).result?.result?.value;
      console.log(result || 'navigating...');
      ws.close();
    });
    setTimeout(() => { ws.close(); process.exit(0); }, 5000);
  });
});
"

echo ""
echo "Chrome ready on port $HEADLESS_PORT"
echo "DM: mengfj"
