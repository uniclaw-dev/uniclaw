#!/usr/bin/env python3
"""Send text to iTerm session via Python API (no focus required)"""

import sys
import iterm2

async def main(connection):
    if len(sys.argv) < 2:
        print(f"Usage: notify-iterm-api.py 'message' [session_index]")
        sys.exit(1)
    
    message = sys.argv[1]
    session_index = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0  # 1-indexed to 0-indexed
    
    app = await iterm2.async_get_app(connection)
    window = app.current_window
    
    if not window:
        print("No current window")
        sys.exit(1)
    
    tab = window.current_tab
    sessions = tab.sessions
    
    if session_index >= len(sessions):
        print(f"Session {session_index + 1} not found (only {len(sessions)} sessions)")
        sys.exit(1)
    
    session = sessions[session_index]
    
    # Send text, then send Enter key (try multiple approaches)
    await session.async_send_text(message)
    
    # Try sending escape sequence for Enter
    await session.async_send_text("\x0d")  # \r
    await session.async_send_text("\x0a")  # \n
    
    print(f"Sent to session {session_index + 1}")

iterm2.run_until_complete(main)