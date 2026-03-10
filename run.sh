#!/bin/bash
# UniClaw Runner

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_PID_FILE="$SCRIPT_DIR/agent.pid"
AGENT_LOG="$SCRIPT_DIR/agent.log"

cd "$SCRIPT_DIR"

start_agent() {
    if [ -f "$AGENT_PID_FILE" ] && kill -0 $(cat "$AGENT_PID_FILE") 2>/dev/null; then
        echo "Agent already running (PID: $(cat $AGENT_PID_FILE))"
        return 1
    fi
    echo "Starting UniClaw agent..."
    nohup node uniclaw-agent.js > "$AGENT_LOG" 2>&1 &
echo $! > "$AGENT_PID_FILE"
    echo "Started (PID: $(cat $AGENT_PID_FILE))"
}

stop() {
    if [ -f "$AGENT_PID_FILE" ]; then
        PID=$(cat "$AGENT_PID_FILE")
        kill $PID 2>/dev/null && echo "Stopped agent"
        rm -f "$AGENT_PID_FILE"
    fi
}

status() {
    if [ -f "$AGENT_PID_FILE" ] && kill -0 $(cat "$AGENT_PID_FILE") 2>/dev/null; then
        echo "Agent running (PID: $(cat $AGENT_PID_FILE))"
        tail -10 "$AGENT_LOG"
    else
        echo "Agent not running"
        rm -f "$AGENT_PID_FILE"
    fi
}

case "$1" in
    start)
        start_agent
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        stop
        sleep 1
        start_agent
        ;;
    logs)
        tail -f "$AGENT_LOG"
        ;;
    stop-chrome)
        pkill -f "chrome.*9223" 2>/dev/null && echo "Stopped Chrome 9223"
        ;;
    *)
        echo "Usage: $0 {start|stop|stop-chrome|status|restart|logs}"
        exit 1
        ;;
esac
