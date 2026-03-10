#!/bin/bash
# Send a message to an iTerm2 pane and submit it
# Usage: ./notify-other-session.sh "your message here" [session_number]

# Note: Briefly activates iTerm2, sends Enter key, then restores previous app
# This prevents the "System Events" permission dialog from appearing

MESSAGE="$1:-check}"
TARGET_SESSION="${2:-1}"

# Escape double quotes for AppleScript
ESCAPED_MESSAGE="${MESSAGE//\"/\\\"}"

# Write text to session, briefly activate iTerm2, send Enter, restore previous app
osascript <<EOF
-- Get the frontmost app before we switch
tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
end tell

tell application "iTerm"
    activate
    tell current window
        tell tab 1
            tell session $TARGET_SESSION
                write text "$ESCAPED_MESSAGE" newline no
            end tell
        end tell
    end tell
end tell

delay 0.2

tell application "System Events"
    key code 76
end tell

delay 0.1

-- Restore previous app if frontApp is not "iTerm2"
if frontApp is not "iTerm2" then
    tell application frontApp to activate
end if
EOF

echo "Sent to session $TARGET_SESSION"