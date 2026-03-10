# UniClaw 🐾

A personal AI agent that routes tasks from Slack DM to terminal-based AI agents (Claude Code, Opencode, Aider, etc.).

## Why UniClaw?

Similar to [OpenClaw](https://github.com/openclaw/openclaw) (🐻) but optimized for developer workflows with **universal agent support**.

## Feature Comparison

| Feature | OpenClaw | UniClaw |
|---------|----------|---------|
| Agent | API-based LLMs (OpenAI, etc.) | Any terminal agent (Claude Code, Opencode, Aider) |
| Channels | 20+ native integrations | Any browser-based chat |
| Tools | bash, read/write, browser | Full agent capabilities |
| Setup | npm + wizard | Node + Chrome debug |
| Complexity | Full platform (~265K LOC) | Lightweight (~250 LOC) |
| Cost | API usage fees | Your agent's cost model |

## Key Advantages Over OpenClaw

### 1. Multi-Agent Parallel Execution
**OpenClaw:** Single agent per session. If busy → request is queued or blocked.
**UniClaw:** Multiple independent agents. One can work while another responds.
```
# jarvis running Long task
jarvis: run full eZe test suite (takes 30 mins)
# friday can observe, query status,
or do other work
friday: what's the status of jarvis's tests? 
friday: check jarvis's logs for errors 
friday: meanwhile, review this PR
```

### 2. No Blocking on Long Tasks
- Each pane is an independent agent session
- Long-running tasks don't block other queries
- Monitor progress from your phone while tests run

### 3. Cross-Agent Observability
- One agent can check another's output files
- Real-time log streaming to Slack
- Debug one task while another runs

### 4. Universal Agent Support
- Claude Code, Opencode, Aider, Codex CLI, Gemini CLI
- Any terminal-based AI agent works
- Mix different agents across panes

### 5. Full System Access
- OpenClaw: Limited to defined tool APIs
- UniClaw: Full agent capabilities (git, tests, file system, terminal)

## Use Case Examples

| Scenario | OpenClaw | UniClaw |
|----------|----------|---------|
| Run 30-min test suite | Blocked until done | Pane 1 runs, Pane 2 free |
| Check status mid-task | /status shows queue | Ask Pane 2 to check Pane 1 |
| Parallel code reviews | Queue requests | Each pane reviews different PR |
| Debug while building | Wait for build | Build on Pane 1, debug on Pane 2 |

## Architecture

### Concept Mapping (OpenClaw → UniClaw)

| OpenClaw Concept | UniClaw Equivalent | Description |
|-----------------|-------------------|-------------|
| **Gateway** | `uniclaw-agent.js` | Central control plane, routes messages |
| **Channel** | Chrome Web | Chrome + Slack Web |
| **Agent/Sessions** | iTerm Pane + Claude Code | Terminal-based AI agent |
| **Tools** | Agent's native tools | Full system access (git, fs, terminal) |

### System Diagram

![UniClaw Architecture](docs/architecture.png)

### Data Flow

![UniClaw Data Flow](docs/dataflow.png)

## Features

- **Multi-agent routing:** `jarvis:` → Pane 1, `friday:` → Pane 2, `eleven:` → Pane 3 (expandable)
- **Universal agent support:** Claude Code, Opencode, Aider, any terminal agent
- **Async observation:** Watch logs from phone while tasks run
- **Chunked output:** Long results split into multiple Slack messages (~3500 chars each)
- **Duplicate detection:** Hash tracking prevents re-processing
- **Response detection:** Skips commands that already have `&lt;agent&gt;: ` responses
- **No blocking:** Parallel task execution across panes


**Behavior details:**
1. `getLatestMessageForAgent()` only returns the most recent command (iterates from end, breaks on first match)
2. When busy (`pending_task <agent>` exists), the new command's hash is NOT saved
3. After task completes, only the latest command is checked - any commands sent in between are skipped

**Workaround:** Wait for `<agent>: ` confirmation before sending the next command, or use a different agent (e.g., `friday:` instead of `jarvis:`).

## Files

| File | Purpose |
|------|---------|
| `uniclaw-agent.js` | Monitors Slack DM, dispatches tasks, sends results |
| `notify-other-agent.js` | Sends input to iTerm pane via AppleScript |
| `run.sh` | Start/stop/status management script |
| `start-headless.sh` | Start headless Chrome with debug port for cookie export |
| `start-chrome-debug.sh` | Start Chrome with Slack session |

**Example:**
| Current task <name> | Current task for agent (e.g.g., `pending_task_jarvis`) |
| task_result <name> | Result from agent to send back to Slack (e.g.g., `task_result_jarvis`) |

## Prerequisites
1. **Node. js with ws module**
    ```bash
    cd ~/uniclaw && npm install ws
    ```
2. **iTerm2** (for split panes)
3. **Chrome** (for initial Slack login only)

## Quick Start

### First-Time Setup
```bash
# 1. Start debug Chrome (uses separate profile, won't affect your regular Chrome)
./start-chrome-debug.sh
# 2. In the new Chrome window:
# - Go to https://app.slack. com
# - Login to Slack
# - Open your DM (messages to yourself)
# 3. Open iTerm and create split panes (Cd+D)
# - Pane 1: for jarvis
# - Pane 2: for friday
# 4. Start Claude Code in each pane
# Pane 1: claude
# Pane 2: claude
# 5. Start UniClaw
/run.sh start
```

### Daily Startup (after first-time setup)
```bash
# 1. Start debug Chrome (reuses saved Slack session)
./start-chrome-debug.sh
# 2. Start Claude in iTerm panes
# Pane 1: claude
# Pane 2: claude
# 3. Start UniClaw
/run. sh start
```

**That's it!** Send messages in Slack DM Like 'jarvis: hello to test.
## How It Works
| Chrome Instance | Port | Purpose                                                |
| --------------- | ---- | ------------------------------------------------------ |
| Debug Chrome    | 9222 | Export Slack cookies (visible, for login)              |
| Headless Chrome | 9223 | Monitor Slack messages (invisible, runs in background) |

On `./run.sh start`:
1. Cookies are exported from Chrome debug → headless Chrome
2. Headless Chrome opens Slack with your session
3. Agent polls headless Chrome for new messages
4. UniClaw determines which iTerm pane receives the task
5. UniClaw prefixes messages for these prefixes
6. Responses are tagged with the agent name (e.g., `jarvis:`)

## Usage

### Agent Names

UniClaw uses **Agent Names** as message prefixes to route tasks to the correct terminal pane:

| Agent Name | Target Pane | Example |
|-----------|-------------|---------|
| `jarvis:` | Pane 1 | `jarvis: run tests` |
| `friday:` | Pane 2 | `friday: check git status` |
| `eleven:` | Pane 3 | `eleven: review this PR` |

### How It Works:**
- You prefix your Slack message with an Agent Name (e.g.g., `jarvis:`)
- UniClaw determines which iTerm pane receives the task
- The prefix determines which iTerm pane receives the task
- Responses are tagged with the agent name (e.g.g., `jarvis:`)

### Examples

# Basic commands
jarvis: pwd
friday: check git status

# Long-running tasks
jarvis: run all e2e tests

# Query status while jarvis is busy
friday: what's in jarvis's result file?
friday: tail the test logs

# Parallel work
jarvis: refactor the auth module
friday: write tests for the API
eleven: review the PR

### Dynamic Agent Spawning

Agents can spawn new Claude Code sessions for other agents. This is useful when you need more parallel workers or when an agent is offline.
```
# Ask jarvis to bring eleven online
jarvis: eleven is offline, start a new claude code session in pane 3 for eleven

# jarvis will:
# 1. Open a new iTerm pane or select pane 3
# 2. Run `claude` command to start Claude Code
# 3. eleven is now ready to receive tasks

Now you can use eleven:
eleven: review PR 456
```

**Use cases:**
- **Scale up on demand:** Start with one agent, spawn more when workload increases
- **Recovery:** If an agent crashes, ask another agent to restart it
- **Specialized agents:** Spawn agents in different directories for different projects
# Example: Scale up for a big task
```
jarvis: I need help. Start friday in pane 2 with working dir ~/project-b

# jarvis spawns friday, then you can parallelize
jarvis: refactor module A
friday: refactor module B
```
**Note:** The spawning agent needs appropriate permissions to run AppleScript and control iTerm.

## Management

```bash
./run.sh start    # Start agent
./run.sh stop     # Stop agent
./run.sh status   # Check if running
./run.sh restart  # Restart agent
./run.sh logs     # Follow logs
```
Message Flow
1. `uniclaw-agent.js` polls Slack DM every 10 seconds via headless Chrome
2. Detects messages starting with agent names (e.g., `jarvis:`, `friday:`)
3. Checks if response already exists (e.g. `jarvis:`) - skip if so
4. Writes task to pending_task_<agent> (e.g.g., `pending_task_jarvis`)
5. Calls notify-other-session.sh which:
- Copies the task prompt to clipboard
- Selects the target iTerm pane 
- Paste(Cmd+V) and presses Enter (key code 76)
6. Terminal agent receives the task and executes it
7.Agent writes results to task_result_<agent> (in chunks if long)
8. `uniclaw-agent.js` picks up result and sends to Slack DM

## Configuration
Edit the CONFIG section in uniclaw-agent.js:

```javascript
const CONFIG = {
// Chrome DevTools Protocol
cdpPort: 9223, pageld: null, checkInterval: 10000,
// Headless Chrome port
/ Auto-detected on startup
// 10 seconds
Working directory for task files workDir: '/Users/yourname/uniclaw ,
// Target DM username - always send messages to this DM
// Set to null to send to current active chat (old behavior)
dmTarget: 'Your Name [Team]you',
// Agent Name to iTerm Pane mapping
agents: {
'jarvis':
'friday':
1
2
'eleven': 3,
### DM Target
The dmTarget'
option ensures all responses are sent to a specific DM, even if you're viewing a different channel in Chrome:
- Set to your Slack display name as shown in sidebar (e.g.,
• 'Your Name [Team]you"')
- Set to
null' to send to whatever chat is currently open (old behavior)
### Add more agents
Add new entries to
'CONFIG. agents:
• javascript
agents: {
'jarvis': 1,
'friday': 2,
'eleven':
3
'ultron': 4,
// Any string works
## Extending
### Support other chat platforms
The Chrome DevTools approach works with any browser-based chat:
- Change DOM selectors for Teams, Discord web, etc.
- Update prefix patterns



## Troubleshooting
### Debug Chrome not starting
```bash
# Check if port 9222 is in use
curl -s http://127.0.0.1:9222/json/version
# If nothing responds, start debug Chrome
/start-chrome-debug.sh
```
### Headless Chrome not connecting to Slack
```bash
# Check headless Chrome status
curl-s http://127.0.0.1:9223/json/version
# Force restart headless Chrome with fresh cookies
./run.sh restart
```
### Agent not detecting messages 
```bash
# Check agent logs
./run.sh logs
# Verify Slack page is loaded in headless Chrome
curl -s http://127.0.0.1:9223/json | grep -i slack
```
### Slack session expired
```bash
# 1. Open debug Chrome and re-login to Slack
./start-chrome-debug.sh
# (login to Slack in the browser)
# 2. Restart UniClaw to export fresh cookies
./run.sh restart
```
### Messages not being picked up （stale page）
```bash
# Restart to get fresh headless Chrome session
/run.sh restart
```
### Check agent logs 
```bash
./run.sh logs
# or
tail -f agent.log
```
### Duplicate task detection
Delete 'last_hash_<name>*
files (e.g., last_hash_jarvis') to reset.
## License
MIT