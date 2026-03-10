#!/bin/bash
# UniClaw Runner
# Usage: ./run.sh [start|stop|status|restart|logs]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_PID_FILE="$SCRIPT_DIR/agent.pid"
AGENT_LOG="$SCRIPT_DIR/agent.log"

start_agent_only() {
    if [ -f "$AGENT_PID_FILE" ] && kill -0 $(cat "$AGENT_PID_FILE") 2>/dev/null; then
        echo "UniClaw agent already running (PID: $(cat $AGENT_PID_FILE))"
        return 1
    fi
    
    echo "Starting UniClaw agent..."
    nohup node uniclaw-agent.js > "$AGENT_LOG" 2>&1 &
    echo $! > "$AGENT_PID_FILE"
    echo "Started (PID: $(cat $AGENT_PID_FILE))"
}

start() {
    # Ensure headless Chrome is running
    cd "$SCRIPT_DIR"
    ./start-headless.sh || { echo "Failed to start headless Chrome"; return 1; }
    
    # Force restart on Chrome to get fresh Slack session
    ./start-headless.sh --force || { echo "Failed to restart headless Chrome"; return 1; }
    sleep 1
    
    start_agent_only
}

stop() {
    if [ -f "$AGENT_PID_FILE" ]; then
        PID=$(cat "$AGENT_PID_FILE")
        echo "Stopping UniClaw agent (PID: $PID)..."
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            echo "Stopped"
        else
            echo "Process not running, cleaning up PID file"
            rm -f "$AGENT_PID_FILE"
        fi
    else
        # Try to find and kill by name
        pkill -f "node uniclaw-agent.js" 2>/dev/null && echo "Stopped" || echo "Not running"
    fi
}

status() {
    if [ -f "$AGENT_PID_FILE" ] && kill -0 $(cat "$AGENT_PID_FILE") 2>/dev/null; then
        echo "Running (PID: $(cat $AGENT_PID_FILE))"
        echo "Recent logs:"
        tail -5 "$AGENT_LOG" 2>/dev/null
    else
        echo "Not running"
        if [ -f "$AGENT_PID_FILE" ]; then
            rm -f "$AGENT_PID_FILE"
            echo "Cleaned up stale PID file"
        fi
    fi
}

restart() {
    stop
    sleep 1
    start
}

logs() {
    tail -f "$AGENT_LOG"
}

# Main entry point
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart|logs}"
        exit 1
        ;;
esac