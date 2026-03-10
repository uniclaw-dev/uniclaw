#!/bin/bash
# Send a message to an iTerm2 pane and submit it
# Usage: ./notify-other-session.sh "your message here" [session_number]

MESSAGE="${1:-check}"
TARGET_SESSION="${2:-1}"

# Escape double quotes for AppleScript
ESCAPED_MESSAGE="${MESSAGE//\"/\\\"}"

osascript <<EOF
tell application "iTerm"
    tell current window
        tell tab 1
            tell session $TARGET_SESSION
                -- Select this session first
                select
                -- Write text
                write text "$ESCAPED_MESSAGE" newline no
            end tell
        end tell
    end tell
end tell

-- Small delay to ensure text is written
delay 0.1

-- Send Enter key specifically to iTerm
tell application "System Events"
    tell application process "iTerm2"
        keystroke return
    end tell
end tell
EOF

echo "Sent to session $TARGET_SESSION"
