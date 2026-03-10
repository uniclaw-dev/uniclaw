#!/bin/bash
# Start Chrome with remote debugging for UniClaw
# Use this to login to Slack before starting headless Chrome

CHROME_PORT=9222

echo "Starting Chrome with remote debugging on port $CHROME_PORT..."

# Kill existing Chrome on this port
pkill -f "chrome" 2>/dev/null
sleep 2

# Start Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --remote-debugging-port=$CHROME_PORT \
    --user-data-dir="$HOME/.chrome-debug-slack" \
    --no-first-run \
    --no-default-browser-check \
    > /dev/null 2>&1 &

sleep 3

# Wait for Chrome to be ready
echo "Waiting for Chrome to start..."
for i in {1..10}; do
    if curl -s "http://127.0.0.1:$CHROME_PORT/json/version" > /dev/null 2>&1; then
        echo "Chrome ready on port $CHROME_PORT"
        echo "Debug interface: http://127.0.0.1:$CHROME_PORT"
        echo ""
        echo "Next steps:"
        echo "1. Open http://127.0.0.1:$CHROME_PORT in a browser to debug"
        echo "2. Navigate to https://app.slack.com/client/T454XGSPR"
        echo "3. Click on mengfjyou DM"
        echo "4. Run: ./start-headless.sh"
        exit 0
    fi
    sleep 1
done

echo "ERROR: Chrome failed to start on port $CHROME_PORT"
exit 1
