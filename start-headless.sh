#!/bin/bash
# Start headless Chrome for UniClaw
# Exports cookies from regular Chrome if needed, then starts headless Chrome

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HEADLESS_PORT=9222
CHROME_PORT=9222
HEADLESS_PROFILE="$HOME/.chrome-headless-slack"
COOKIES_FILE="$SCRIPT_DIR/slack-cookies.json"

# Check for --force flag to restart headless Chrome
FORCE_RESTART=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE_RESTART=true
fi

# Kill existing headless Chrome if force restart
if [ "$FORCE_RESTART" = true ]; then
    pkill -f "chrome-headless-slack"
    echo "Killed existing headless Chrome"
    sleep 2
fi

# Check if headless Chrome is already running
if curl -s "http://127.0.0.1:$HEADLESS_PORT/json/version" > /dev/null 2>&1; then
    echo "Headless Chrome already running on port $HEADLESS_PORT"
    exit 0
fi

# Export cookies from regular Chrome if available
if curl -s "http://127.0.0.1:$CHROME_PORT/json/version" > /dev/null 2>&1; then
    echo "Found Slack in regular Chrome, exporting fresh cookies..."
    SLACK_PAGE_ID=$(curl -s "http://127.0.0.1:$CHROME_PORT/json" | node -e "
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => {
            const pages = JSON.parse(data);
            const page = pages.find(p => p.url && p.url.includes('slack.com'));
            console.log(page ? page.id : '');
        });
    ")
    
    if [ -n "$SLACK_PAGE_ID" ]; then
        echo "Found Slack page ID: $SLACK_PAGE_ID"
        
        node -e "
            const WebSocket = require('ws');
            const fs = require('fs');
            
            const ws = new WebSocket('ws://127.0.0.1:$CHROME_PORT/devtools/page/$SLACK_PAGE_ID');
            
            ws.on('open', () => {
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Network.getCookies',
                    params: { urls: ['https://app.slack.com', 'https://slack.com'] }
                }));
            });
            
            ws.on('message', (data) => {
                const resp = JSON.parse(data);
                if (resp.id === 1) {
                    const cookies = resp.result?.cookies || [];
                    fs.writeFileSync('$COOKIES_FILE', JSON.stringify(cookies, null, 2));
                    console.log('Exported ' + cookies.length + ' cookies');
                    ws.close();
                    process.exit(0);
                }
            });
            
            ws.on('error', (err) => {
                console.error('Error:', err.message);
                process.exit(1);
            });
            
            setTimeout(() => process.exit(1), 5000);
        "
    fi
fi

# Check if we have cookies
if [ ! -f "$COOKIES_FILE" ]; then
    echo "ERROR: No cookies file found at $COOKIES_FILE"
    echo ""
    echo "To get cookies, start Chrome with debugging and open Slack:"
    echo '  pkill -9 "Google Chrome"'
    echo '  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222'
    echo "  Then open https://app.slack.com and run this script again"
    exit 1
fi

# Start headless Chrome
echo "Starting headless Chrome on port $HEADLESS_PORT..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new \
    --remote-debugging-port=$HEADLESS_PORT \
    --user-data-dir="$HEADLESS_PROFILE" \
    --disable-gpu \
    --window-size=1920,1080 \
    > /dev/null 2>&1 &

sleep 3

# Verify it started
if ! curl -s "http://127.0.0.1:$HEADLESS_PORT/json/version" > /dev/null 2>&1; then
    echo "ERROR: Failed to start headless Chrome"
    exit 1
fi

echo "Headless Chrome started"

# Get the page ID
PAGE_ID=$(curl -s "http://127.0.0.1:$HEADLESS_PORT/json" | node -e "
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
        const pages = JSON.parse(data);
        const page = pages.find(p => p.type === 'page');
        console.log(page ? page.id : '');
    });
")

if [ -z "$PAGE_ID" ]; then
    echo "ERROR: Could not find a page in headless Chrome"
    exit 1
fi

# Import cookies and navigate to Slack
echo "Importing cookies and navigating to Slack..."
node -e "
    const WebSocket = require('ws');
    const fs = require('fs');
    
    const cookies = JSON.parse(fs.readFileSync('$COOKIES_FILE', 'utf8'));
    const ws = new WebSocket('ws://127.0.0.1:$HEADLESS_PORT/devtools/page/$PAGE_ID');
    
    ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Network.enable', params: {} }));
    });
    
    let msgId = 1;
    ws.on('message', (data) => {
        const resp = JSON.parse(data);
        
        if (resp.id === 1) {
            // Set cookies
            for (const cookie of cookies) {
                msgId++;
                ws.send(JSON.stringify({
                    id: msgId,
                    method: 'Network.setCookie',
                    params: {
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain,
                        path: cookie.path,
                        secure: cookie.secure,
                        httpOnly: cookie.httpOnly,
                        sameSite: cookie.sameSite,
                        expires: cookie.expires
                    }
                }));
            }
            
            // Navigate to Slack DM
            setTimeout(() => {
                ws.send(JSON.stringify({
                    id: 9999,
                    method: 'Page.navigate',
                    params: { url: 'https://app.slack.com/client/EK4K46TKR/D0A47AMACAZ' }
                }));
            }, 1000);
        }
        
        if (resp.id === 9999) {
            console.log('Navigated to Slack');
            setTimeout(() => {
                ws.close();
                process.exit(0);
            }, 2000);
        }
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        process.exit(1);
    });
    
    setTimeout(() => process.exit(0), 10000);
"

sleep 3

# Get the final page ID
SLACK_PAGE_ID=$(curl -s "http://127.0.0.1:$HEADLESS_PORT/json" | node -e "
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
        const pages = JSON.parse(data);
        const page = pages.find(p => p.type === 'page' && p.url.includes('slack.com'));
        console.log(page ? page.id : '');
    });
")

echo ""
echo "=== Headless Chrome Ready ==="
echo "Port: $HEADLESS_PORT"
echo "Slack page ID: $SLACK_PAGE_ID"