const WebSocket = require('ws');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// === CONFIGURATION ===
const CONFIG = {
  // Chrome DevTools Protocol
  // Use headless Chrome on port 9223 to avoid background tab throttling
  cdpPort: 9223,
  pageId: null, // Auto-detected on startup
  checkInterval: 10000, // 10 seconds

  // Working directory for task files
  workDir: '/Users/jesse/uniclaw',

  // Target DM - always send messages to this DM
  // Can be:
  //   - Exact display name from sidebar (use debug script to find)
  //   - null: send to current active chat (old behavior)
  // Note: Self-DM shows as "Name [Team]you" (no space before "you")
  dmTarget: null,  // Use current chat (already on mengfj)

  // Agent Name to iTerm Pane mapping
  agents: {
    'jarvis': 1,
    'friday': 2,
    'eleven': 3,
  }
};

// WS_URL is computed after pageId is detected
function getWsUrl() {
  return `ws://localhost:${CONFIG.cdpPort}/devtools/page/${CONFIG.pageId}`;
}

// Auto-detect Slack page ID from Chrome DevTools Protocol
async function detectSlackPageId() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${CONFIG.cdpPort}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pages = JSON.parse(data);
          // Find the Slack page (not service worker)
          const slackPage = pages.find(p =>
            p.url && p.url.includes('app.slack.com/client') && p.type === 'page'
          );
          if (slackPage) {
            resolve(slackPage.id);
          } else {
            reject(new Error('No Slack tab found. Make sure Slack is open in Chrome.'));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Chrome pages: ${err.message}`));
        }
      });
    });
    req.on('error', (err) => {
      reject(new Error(`Cannot connect to Chrome on port ${CONFIG.cdpPort}: ${err.message}`));
    });
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`Timeout connecting to Chrome on port ${CONFIG.cdpPort}`));
    });
  });
}

// Helper to get agent-specific file paths (named by agent ID, not pane)
function getTaskFile(agentId) { return path.join(CONFIG.workDir, `pending_task_${agentId}`); }
function getResultFile(agentId) { return path.join(CONFIG.workDir, `task_result_${agentId}`); }
function getHashFile(agentId) { return path.join(CONFIG.workDir, `last_hash_${agentId}`); }

// Get all configured agent IDs
const agentIds = Object.keys(CONFIG.agents);

// Load last message hash per agent
const lastMessageHash = {};
for (const agentId of agentIds) {
  try {
    const hashFile = getHashFile(agentId);
    if (fs.existsSync(hashFile)) {
      lastMessageHash[agentId] = fs.readFileSync(hashFile, 'utf8').trim();
      console.log(`[INIT] Agent ${agentId} hash: ${lastMessageHash[agentId].substring(0, 30)}...`);
    } else {
      lastMessageHash[agentId] = null;
    }
  } catch (err) {
    console.log(`[INIT] No previous hash for agent ${agentId}`);
    lastMessageHash[agentId] = null;
  }
}

function saveMessageHash(agentId, hash) {
  try {
    fs.writeFileSync(getHashFile(agentId), hash);
  } catch (err) {
    console.error(`[ERROR] Failed to save hash for agent ${agentId}: ${err.message}`);
  }
}

function connectAndRun(expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(getWsUrl());
    let timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout'));
    }, 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression }
      }));
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data);
      if (response.id === 1) {
        clearTimeout(timeout);
        ws.close();
        resolve(response.result?.result?.value || null);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Get latest UNPROCESSED message for a specific agent
// Skip if there's an "${agentId}>" response AFTER this command (case-insensitive)
async function getLatestMessageForAgent(agentId) {
  const prefixLower = `${agentId.toLowerCase()}:`;
  const responsePrefixLower = `${agentId.toLowerCase()}>`;
  const script = `
    (() => {
      const containers = document.querySelectorAll('[data-qa="message_container"]');
      if (containers.length === 0) return null;

      // Find the latest command for this agent (case-insensitive)
      let commandIndex = -1;
      let commandText = null;
      let commandTime = null;

      for (let i = containers.length - 1; i >= 0; i--) {
        const el = containers[i];
        const textEl = el.querySelector('[data-qa="message-text"], .p-rich_text_section');
        const text = textEl ? textEl.innerText.trim() : '';

        if (text.toLowerCase().startsWith('${prefixLower}')) {
          commandIndex = i;
          commandText = text;
          // Use data-msg-ts as unique message ID
          commandTime = el.getAttribute('data-msg-ts') || '';
          break;
        }
      }

      if (commandIndex === -1) return null;

      // Check if there's an "${agentId}>" response AFTER this command (case-insensitive)
      for (let i = commandIndex + 1; i < containers.length; i++) {
        const el = containers[i];
        const textEl = el.querySelector('[data-qa="message-text"], .p-rich_text_section');
        const text = textEl ? textEl.innerText.trim() : '';

        if (text.toLowerCase().startsWith('${responsePrefixLower}')) {
          // Already responded, skip this command
          return JSON.stringify({ alreadyResponded: true });
        }
      }

      return JSON.stringify({
        text: commandText,
        time: commandTime,
        agentId: '${agentId}'
      });
    })();
  `;
  const result = await connectAndRun(script);
  return result ? JSON.parse(result) : null;
}

// Navigate to target DM if configured
async function navigateToDM() {
  if (!CONFIG.dmTarget) return true; // No target configured, use current chat

  const dmTarget = CONFIG.dmTarget.toLowerCase().replace(/^@/, ''); // Remove @ prefix if present
  const targetLower = `${dmTarget}`.toLowerCase();
  const script = `
    (() => {
      // Check if we're already in the target DM
      const headerName = document.querySelector('[data-qa="channel_header_title"]');
      if (headerName) {
        const headerText = headerName.innerText.toLowerCase();
        // Exact match or starts with target (for "Jesse Meng (you)" matching "jesse meng")
        if (headerText === targetLower || headerText.startsWith(targetLower + ' ') || headerText.startsWith(targetLower + '(')) {
          return 'already_there';
        }
      }

      // Look for DM items - need EXACT or very close match to avoid wrong person
      const dmItems = document.querySelectorAll('[data-qa-channel-sidebar-channel-type="im"]');
      for (const item of dmItems) {
        const nameEl = item.querySelector('[data-qa="channel_name_or_presence"]') || item;
        if (nameEl) {
          const nameText = nameEl.innerText.toLowerCase().trim();
          // Exact match or starts with target name
          if (nameText === targetLower || nameText.startsWith(targetLower + ' ') || nameText.startsWith(targetLower + '(')) {
            item.click();
            return 'clicked:' + nameText;
          }
        }
      }

      // Method 2: Look in the sidebar links with strict matching
      const sidebarLinks = document.querySelectorAll('.p-channel_sidebar__channel');
      for (const link of sidebarLinks) {
        const linkText = link.innerText.toLowerCase().trim();
        if (linkText === targetLower || linkText.startsWith(targetLower + ' ') || linkText.startsWith(targetLower + '(')) {
          link.click();
          return 'clicked:' + linkText;
        }
      }

      return 'not_found';
    })()
  `;
  const result = await connectAndRun(script);
  if (result === 'already_there') {
    return true;
  }

  if (result && result.startsWith('clicked:')) {
    console.log(`[NAV] Clicked on: ${result.substring(8)}`);
    // Wait for navigation to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  if (result === 'not_found') {
    console.log(`[WARN] Could not find DM for "${CONFIG.dmTarget}" in sidebar, trying quick switcher...`);

    // Try using Cmd+K quick switcher
    const quickSwitchScript = `
      (() => {
        // Trigger Cmd+K
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }));
        return 'triggered';
      })()
    `;
    await connectAndRun(quickSwitchScript);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Type the DM target name
    const typeScript = `
      (() => {
        const input = document.querySelector('[data-qa="focusable_search_input"]') ||
                      document.querySelector('.c-search_modal__input_input') ||
                      document.querySelector('[placeholder*="Search"]');
        if (input) {
          input.value = '${CONFIG.dmTarget}';
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
          return 'typed';
        }
        return 'no_input';
      })()
    `;
    await connectAndRun(typeScript);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Press Enter to select first result
    const enterScript = `
      (() => {
        const firstResult = document.querySelector('[data-qa="search-result-item"]') ||
                           document.querySelector('.c-search_modal__result_item');
        if (firstResult) {
          firstResult.click();
          return 'selected';
        }
        // Try pressing Enter
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return 'enter';
      })()
    `;
    await connectAndRun(enterScript);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }
  return false;
}

async function sendMessage(text) {
  // Navigate to target DM first
  const navigated = await navigateToDM();
  if (!navigated) {
    console.log(`[ERROR] Failed to navigate to DM ${CONFIG.dmTarget}`);
  }

  const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const script = `
    (() => {
      const input = document.querySelector('[data-qa="message_input"] [contenteditable="true"], .ql-editor');
      if (!input) return 'no input found';

      input.focus();
      input.innerHTML = '<p>${escapedText}</p>';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));

      setTimeout(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }, 100);
      return 'sent';
    })()
  `;
  await connectAndRun(script);
  console.log(`[SENT] ${text.substring(0, 50)}...`);
}

function hashMessage(msg) {
  if (!msg || !msg.text) return null;
  return `${msg.time}:${msg.text}`;
}

// Check if there's a result to send back (check all agents)
async function checkForResult() {
  for (const agentId of agentIds) {
    const resultFile = getResultFile(agentId);

    try {
      if (fs.existsSync(resultFile)) {
        const result = fs.readFileSync(resultFile, 'utf8').trim();
        if (result) {
          // Split long results into chunks for Slack (limit ~4000 chars)
          if (result.length > 3500) {
            const chunks = [];
            let remaining = result;
            while (remaining.length > 0) {
              chunks.push(remaining.slice(0, 3500));
              remaining = remaining.slice(3500);
            }
            for (const chunk of chunks) {
              await sendMessage(chunk);
            }
          } else {
            await sendMessage(result);
          }
          fs.unlinkSync(resultFile);
          console.log(`[RESULT] Sent agent ${agentId} result to Slack (${result.length} chars)`);
        }
      }
    } catch (err) {
      console.error(`[ERROR] Agent ${agentId} result check: ${err.message}`);
    }
  }
}

async function checkAgentForNewTask(agentId) {
  try {
    const msg = await getLatestMessageForAgent(agentId);
    if (!msg || msg.error || msg.alreadyResponded) {
      return;
    }

    const currentHash = hashMessage(msg);
    if (currentHash && currentHash !== lastMessageHash[agentId]) {
      // Check if agent is already processing a task
      const taskFile = getTaskFile(agentId);
      if (fs.existsSync(taskFile)) {
        // Check if pending task is stale (older than 5 minutes)
        const taskStat = fs.statSync(taskFile);
        const ageMinutes = (Date.now() - taskStat.mtimeMs) / 1000 / 60;
        if (ageMinutes > 5) {
          console.log(`[STALE] Agent ${agentId} pending task is ${ageMinutes.toFixed(1)} min old, removing`);
          fs.unlinkSync(taskFile);
        } else {
          // Update hash so we don't keep detecting the same message as "new"
          // This means the task is DROPPED when agent is busy
          lastMessageHash[agentId] = currentHash;
          saveMessageHash(agentId, currentHash);
          console.log(`[BUSY] Agent ${agentId} busy, DROPPED task: ${msg.text.substring(0, 50)}...`);
          return;
        }
      }

      lastMessageHash[agentId] = currentHash;
      saveMessageHash(agentId, currentHash);
      // Remove "agentId:" prefix (case-insensitive, find first colon)
      const colonIndex = msg.text.indexOf(':');
      const userIntent = msg.text.substring(colonIndex + 1).trim();

      const pane = CONFIG.agents[agentId];
      console.log(`[NEW] Task for agent ${agentId} (pane ${pane}): ${userIntent.substring(0, 50)}${userIntent.length > 50 ? '...' : ''}`);

      // Write task to agent-specific file (taskFile already declared above)
      fs.writeFileSync(taskFile, userIntent);
      await sendMessage(`Got it! Task queued for agent ${agentId}: "${userIntent.substring(0, 50)}${userIntent.length > 50 ? '...' : ''}"`);
      console.log(`[QUEUED] Task written to file`);

      // Build the full prompt with task and instructions
      const resultFile = getResultFile(agentId);
      const prompt = `[Slack Task from DM] ${userIntent}

Reply via: ${resultFile}
- Prefix responses with "${agentId}>"
- For long output, write in chunks (~3000 chars). Agent polls every 10s.
- Delete ${taskFile} when done.
- For simple questions, one short response is fine.
- End with "____________________" on a new line when task is complete.`;

      try {
        // Escape special chars for shell
        const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\$/g, '\\$');
        const scriptDir = __dirname;
        execSync(`${scriptDir}/notify-other-session.sh "${escapedPrompt}" ${pane}`, { stdio: 'inherit' });
        console.log(`[NOTIFY] Triggered agent ${agentId} (iTerm pane ${pane})`);
      } catch (err) {
        console.error(`[ERROR] Failed to notify agent ${agentId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[ERROR] Agent ${agentId}: ${err.message}`);
  }
}

// Track last known session status for change detection
const lastSessionStatus = {};

// Helper: Generate AppleScript to set pane name with agent prefix
function getSetNameScript(pane, agentId) {
  return `
    tell application "iTerm"
      tell current window
        tell tab 1
          tell session ${pane}
            set currentName to name
            if currentName does not start with "${agentId}:" then
              set name to "${agentId}: " & currentName
            end if
          end tell
        end tell
      end tell
    end tell
  `;
}

// Helper: Generate AppleScript to get TTY from pane
function getGetTtyScript(pane) {
  return `
    tell application "iTerm"
      tell current window
        tell tab 1
          tell session ${pane}
            return tty
          end tell
        end tell
      end tell
    end tell
  `;
}

async function checkLoop() {
  console.log(`[${new Date().toLocaleTimeString()}] Checking...`);

  // First check if there's a result to send
  await checkForResult();

  // Check each agent for new tasks independently
  for (const agentId of agentIds) {
    await checkAgentForNewTask(agentId);
  }

  // Check for session changes (claude connected/disconnected)
  await checkSessionChanges();
}

// Check if any agent sessions have changed and notify via DM
async function checkSessionChanges() {
  for (const [agentId, pane] of Object.entries(CONFIG.agents)) {
    try {
      // Refresh the pane name with agent prefix
      try {
        execSync(`osascript -e '${getSetNameScript(pane, agentId)}'`, { encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        // ignore name set errors
      }

      const tty = execSync(`osascript -e '${getGetTtyScript(pane)}'`, { encoding: 'utf8' }).trim();
      let hasClaude = false;
      try {
        const psList = execSync(`ps -t ${tty} -o comm=`, { encoding: 'utf8' }).trim().split('\n');
        hasClaude = psList.some(p => p.includes('claude'));
      } catch (e) {
        // ignore
      }

      const prevStatus = lastSessionStatus[agentId];
      if (prevStatus !== undefined && prevStatus !== hasClaude) {
        if (hasClaude) {
          console.log(`[SESSION] ${agentId} connected`);
          await sendMessage(`${agentId}: claude connected`);
        } else {
          console.log(`[SESSION] ${agentId} disconnected`);
          await sendMessage(`${agentId}: claude disconnected`);
        }
      }
      lastSessionStatus[agentId] = hasClaude;
    } catch (err) {
      // pane not found, ignore
    }
  }
}

// Detect what's running in each iTerm pane and set pane names
async function detectPaneSessions() {
  const results = [];

  for (const [agentId, pane] of Object.entries(CONFIG.agents)) {
    try {
      // Set the pane name with agent prefix
      try {
        execSync(`osascript -e '${getSetNameScript(pane, agentId)}'`, { encoding: 'utf8' });
      } catch (e) {
        // ignore
      }

      // Get the TTY from the pane
      const tty = execSync(`osascript -e '${getGetTtyScript(pane)}'`, { encoding: 'utf8' }).trim();

      // Check if claude is running on that TTY
      let session = 'no claude';
      try {
        const psList = execSync(`ps -t ${tty} -o comm=`, { encoding: 'utf8' }).trim().split('\n');
        if (psList.some(p => p.includes('claude'))) {
          session = 'claude';
        }
      } catch (e) {
        session = 'unable to detect';
      }

      results.push({ agentId, pane, session });
    } catch (err) {
      results.push({ agentId, pane, session: 'pane not found' });
    }
  }

  return results;
}

async function main() {
  console.log('=== UniClaw Agent ===');

  // Auto-detect Slack page ID
  try {
    CONFIG.pageId = await detectSlackPageId();
    console.log(`[AUTODETECT] Slack page ID: ${CONFIG.pageId}`);
  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  console.log('Configured agents:');
  for (const [agentId, pane] of Object.entries(CONFIG.agents)) {
    console.log(`  ${agentId}: -> Pane ${pane}`);
  }
  console.log('\nTask files: pending_task_<agentId>');
  console.log('Result files: task_result_<agentId>');
  console.log(`Check interval: ${CONFIG.checkInterval / 1000}s\n`);

  // Detect and report pane sessions on startup
  try {
    const sessions = await detectPaneSessions();
    const statusLines = sessions.map(s => `${s.agentId}: ${s.session}`);
    const statusMsg = `UniClaw started!\n${statusLines.join('\n')}\n----------------------------------------`;
    console.log(`[STARTUP] Detected sessions:`);
    sessions.forEach(s => {
      console.log(`  ${s.agentId}: ${s.session}`);
      // Initialize session tracking
      lastSessionStatus[s.agentId] = s.session === 'claude';
    });
    console.log('[STARTUP] Sending startup message...');
    await sendMessage(statusMsg);
    console.log('[STARTUP] Startup message sent');
  } catch (err) {
    console.error('[STARTUP] Failed to detect sessions:', err.message);
  }

  console.log('[STARTUP] Starting check loop...');
  await checkLoop();
  console.log('[STARTUP] First check done, starting interval...');
  setInterval(checkLoop, CONFIG.checkInterval);
}

main().catch(console.error);