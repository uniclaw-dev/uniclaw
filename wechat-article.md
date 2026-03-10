# 给Claude Code装上虾爪：如何用500行代码实现OpenClaw

**副标题**：基于浏览器DevTools协议的通用AI智能体通讯网关实践

---

## 01 问题的提出：当AI智能体需要一个"通讯器"

2024年，以大模型为基础的AI编程工具（Claude Code、GitHub Copilot Chat、Codex CLI、Aider等）正在重塑开发者的工作流。这些工具的能力边界不断扩展——它们不仅能补全代码，还能执行shell命令、读写文件、分析整个代码库。

然而，一个根本性的制约依然存在：**交互的时空限制**。

当你使用 Claude Code 时，你必须：
- 坐在电脑前
- 打开终端
- 保持会话活跃
- 等待任务完成

如果你的测试套件需要运行30分钟，这30分钟内你无法做其他事情——或者你必须开启另一个终端会话，在两个窗口之间来回切换。

**OpenClaw 的核心洞察**在于：将AI智能体接入人类已经广泛使用的**即时通讯基础设施**（Slack、Teams、Discord）。智能体像人类同事一样"在线"，你可以在任何时间、任何地点，通过手机或电脑向它发送指令。

> 深夜12点，躺在床上突然想起明天要用的数据分析还没跑。你打开Slack，@jarvis："把Q3销售数据跑一下，明早8点前发我邮箱"。第二天早上，报告已经在邮箱里了。

这正是 OpenClaw 试图实现的目标：**任何时刻，智能体随叫随到**。

---

## 02 OpenClaw的架构解析

OpenClaw 的架构设计体现了一个清晰的分层思想，核心是一个 WebSocket 网关协调多个子系统：

### 2.1 Gateway（网关控制平面）

Gateway 是整个系统的单一控制平面，运行在 WebSocket 上（默认 `ws://127.0.0.1:18789`）。它不是简单的"路由器"，而是统一管理 sessions、channels、tools 和 events 的核心枢纽。

Gateway 维护着：
- **会话状态**：主会话、群组隔离、激活模式、队列模式
- **设备节点**：macOS/iOS/Android 设备的连接
- **工具注册**：可调用能力的注册表（ClawHub）

### 2.2 Channel（通讯管道）

Channel 负责连接各种即时通讯平台。OpenClaw 官方实现了20多种 Channel 集成——WhatsApp、Telegram、Slack、Discord、Email 等。

Channel 的核心职责：
- 作为外部消息的入口，将聊天平台的消息转换为内部事件
- 将 Agent 的响应路由回原始聊天平台
- 处理平台特有的身份验证和格式转换

### 2.3 Agent (Pi)

这是 OpenClaw 的智能核心——Pi Agent Runtime。它不是一个简单的 API 客户端，而是一个完整的运行时环境：

- **RPC 模式**：与 Gateway 通过 RPC 通信
- **Tool Streaming**：支持工具调用的流式输出
- **Block Streaming**：支持分块响应和增量更新
- **浏览器控制**：内置浏览器自动化能力
- **Canvas + A2UI**：可视化交互界面
- **语音唤醒**：Voice Wake/Talk Mode

### 2.4 Session（会话管理）

Session 是 OpenClaw 中容易被忽视但至关重要的组件。它维护着：
- 对话上下文和状态
- 直接聊天 vs 群组隔离的不同模式
- 激活状态（Agent 是否处于"监听"状态）
- 队列模式（消息排队还是并行处理）
- 回复回溯（多轮对话的连贯性）

### 2.5 数据流

```
WhatsApp/Slack/Discord → Channel → Gateway → Pi Agent Runtime
                                                  ↓
                                         Tool Execution
                                         (Browser/File/System)
                                                  ↓
            Response ← Channel ← Gateway ← Result
```

这个架构的优势在于**平台无关性**——无论用户从哪个 Channel 进入，Gateway 都将其统一到同一会话体系，由 Pi Agent 统一处理。

---

## 03 OpenClaw的限制与反思

尽管设计优雅，OpenClaw 的官方实现存在一些值得注意的局限：

### 3.1 架构复杂度高

OpenClaw 是一个完整的 SaaS 平台，代码量约26万行。要部署它，你需要：
- 配置多个服务（Gateway、Channel 适配器、数据库）
- 管理 API 密钥和凭据
- 维护基础设施

### 3.2 Agent 能力受限

OpenClaw 的 Agent 通过 API 调用 LLM。这意味着：
- **没有持久化记忆**：每次请求都是独立的 API 调用
- **没有技能系统**：Agent 不会随着使用变得"更懂你"
- **没有代码库上下文**：Agent 对你的项目一无所知
- **工具受限**：只能通过预定义的 tool API 操作

### 3.3 单会话阻塞

OpenClaw 的 Agent Session 是单线程的。如果一个任务正在执行（比如运行30分钟的测试套件），后续的请求会被排队或阻塞。

### 3.4 成本模型

虽然 OpenClaw 本身是开源免费的（MIT License），但你仍然需要支付 LLM API 的调用费用（OpenAI、Anthropic 等）。对于重度使用场景，API 费用会显著增加。

---

## 04 UniClaw的设计哲学：终端即Agent

面对已经成熟的 Claude Code，一个自然的疑问是：与其从零构建新的 Agent 系统，不如直接赋予它通讯的能力？UniClaw 正是这个思路的产物——用500行代码，为现有的终端智能体装上"虾爪"。

### 4.1 核心洞察

今天的终端 AI 工具（Claude Code、Opencode、Aider、Codex CLI）已经足够强大。它们具有：
- 内置的代码库索引（Claude Code 的 `~/.claude/` 目录）
- 技能系统（`/skill` 命令）
- 项目记忆（通过 Embeddings 记住代码结构）
- 完整的终端能力（任意 shell 命令）

**为什么不能直接用这些工具作为 Agent？**

### 4.2 架构重构

UniClaw 将 OpenClaw 的 "Agent Sessions" 从云 API 替换为**本地 iTerm 分屏**：

| 组件 | OpenClaw | UniClaw |
|------|----------|---------|
| Agent | API-based LLM | Terminal Agent (Claude Code) |
| 运行时 | Cloud | Local iTerm panes |
| 会话管理 | Gateway 维护 | iTerm 窗口管理 |
| 上下文 | Stateless | Stateful (项目记忆) |

具体的映射关系：
- **Pane 1** → jarvis (Claude Code)
- **Pane 2** → friday (Claude Code / Opencode)
- **Pane 3** → eleven (Aider / 其他 Agent)

### 4.3 关键技术：Chrome DevTools Protocol

UniClaw 不需要复杂的 Bot API 集成。它利用 Chrome 浏览器的一个强大特性——**DevTools Protocol**。

实现原理：
1. **Chrome 9222**：你日常登录 Slack 的浏览器（有完整的 cookies 和 session）
2. **Chrome 9223**：一个无头（headless）Chrome 实例，通过 CDP 监控 Slack 网页版
3. **uniclaw-agent.js**：每10秒查询一次 9223 端口，检查新消息
4. **AppleScript**：发现消息后，直接将任务文本"写"入对应的 iTerm 分屏

这个方案的关键优势在于**通用性**——它不关心 Slack 的 API 如何变化，也不关心权限设置。只要你能用浏览器打开 Slack，UniClaw 就能工作。

更进一步的，任何**基于网页的通讯工具**都可以被支持：Discord Web、Microsoft Teams Web、飞书网页版、钉钉 Web 端……只需修改 CSS 选择器即可。

---

## 05 UniClaw的六大核心优势

### 5.1 真正的并行执行

与 OpenClaw 的单会话阻塞不同，UniClaw 的三个 iTerm 分屏是**真正并行**的操作系统进程：

```
你：jarvis，跑一下全量测试（预计2小时）
# jarvis 在 Pane 1 开始工作

1小时后你：friday，帮我看下 jarvis 的测试跑到哪了？
friday：已经跑了67%，目前没报错，这是实时日志...

# jarvis 继续跑，friday 帮你监控，两者互不干扰
```

### 5.2 跨Agent可观察性

因为每个 Agent 都在本地文件系统写入结果，**一个 Agent 可以读取另一个 Agent 的输出**：

```bash
# jarvis 在跑测试
jarvis: 跑全量测试套件

# 你问 friday
friday: 看看 jarvis 的测试日志最后50行
# friday 直接读取 ~/uniclaw/task_result_jarvis
```

这种设计使得 Agent 之间可以协作，而不只是独立工作。

### 5.3 复用现有Agent生态

这是 UniClaw 与 OpenClaw 最根本的区别：

**OpenClaw**：从零创建 Agent，无技能、无记忆、无上下文。

**UniClaw**：使用你已经配置好的 Claude Code 会话：
- **技能**：所有 `/skill` 命令可用（git、bash、代码分析、Web 搜索等）
- **记忆**：Claude 记住你的代码库结构、编码偏好、项目约定
- **上下文**：`.claude/` 目录中的项目特定知识
- **无需重新训练**：Agent 已经了解你的项目

### 5.4 零API费用

UniClaw 本身是纯本地运行的。Claude Code 使用你自己的 API Key，但调度系统**完全免费**。没有订阅费，没有额外的 LLM 调用成本。

### 5.5 手机远程控制

只要手机能打开 Slack，你就能向家里的电脑发送指令。下班路上@jarvis："把今天写的代码 push 到 dev 分支并创建 PR"，到家时工作已经完成。

### 5.6 极简部署

整个系统只需要：
- Node.js + ws 模块（一个文件）
- Chrome 浏览器（两个窗口）
- iTerm2（分屏）

没有 Docker，没有数据库，没有消息队列。500行代码，5分钟部署。

---

## 06 数据流详解

让我们追踪一条消息的完整生命周期：

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   You       │     │  Chrome 9223 │     │  uniclaw-agent  │
│  (Slack)    │────▶│  (Headless)  │────▶│   (Node.js)     │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  You        │     │  Chrome 9222 │     │  notify-other-  │
│  (See       │◀────│  (Response)  │◀────│  session.sh     │
│  result)    │     │              │     │   (AppleScript) │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │  iTerm Pane 1   │
                                       │  (Claude Code)  │
                                       └─────────────────┘
```

**步骤分解**：

1. **消息发送**：你在 Slack 网页版（Chrome 9222）发送 `jarvis: status`
2. **消息同步**：Slack 服务器将消息同步到网页，Chrome 9223（无头浏览器）也收到更新
3. **消息检测**：`uniclaw-agent.js` 每10秒通过 CDP 查询 9223，发现新消息
4. **任务分发**：Agent 解析消息前缀 `jarvis:`，确定目标为 Pane 1
5. **本地投递**：`notify-other-session.sh` 使用 AppleScript 选择 iTerm Pane 1，写入任务文本并模拟回车
6. **任务执行**：Claude Code 在 Pane 1 接收任务，执行 `status` 命令
7. **结果回写**：Claude Code 将结果写入 `~/uniclaw/task_result_jarvis`
8. **结果采集**：`uniclaw-agent.js` 在下次轮询时发现结果文件，读取内容
9. **响应发送**：Agent 通过 Chrome 9223 的 CDP 执行 JavaScript，在 Slack 网页版的消息框输入结果并发送
10. **消息可见**：你在 Chrome 9222 中看到 `jarvis>` 的回复

---

## 07 核心实现解析

### 7.1 消息检测逻辑

```javascript
// uniclaw-agent.js 核心循环
async function checkAgentForNewTask(agentId) {
  const msg = await getLatestMessageForAgent(agentId);
  if (!msg || msg.alreadyResponded) return;

  const currentHash = hashMessage(msg);
  if (currentHash === lastMessageHash[agentId]) return; // 已处理过

  // 新消息，写入任务文件
  fs.writeFileSync(getTaskFile(agentId), msg.text);

  // 通知 iTerm
  notifyPane(agentId, msg.text);
}
```

关键设计：
- **哈希去重**：基于消息内容+时间戳的哈希，防止重复处理
- **响应检测**：扫描后续消息，如果已有 `jarvis>` 回复则跳过
- **文件系统解耦**：Agent 通过读写文件通信，无需网络 socket

### 7.2 Chrome DevTools 协议应用

```javascript
// 连接到无头 Chrome
const ws = new WebSocket(
  `ws://localhost:9223/devtools/page/${pageId}`
);

// 执行 JavaScript 查询消息
ws.send(JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: {
    expression: `
      document.querySelectorAll('[data-qa="message_container"]')
        .map(el => el.innerText)
    `
  }
}));
```

这个方案比 Slack Bot API 更稳定——它不依赖特定平台的权限，也不受 API 变更影响。

### 7.3 iTerm 控制

```bash
# notify-other-session.sh
tell application "iTerm"
  tell current window
    tell tab 1
      tell session $TARGET_SESSION
        select                    -- 激活目标分屏
        write text "$MESSAGE"     -- 写入任务
      end tell
    end tell
  end tell
end tell
```

注意：这里没有使用剪贴板（避免污染），而是直接通过 iTerm 的 AppleScript 接口写入。

---

## 08 使用指南

### 8.1 首次部署

```bash
# 1. 克隆仓库
git clone https://github.com/uniclaw-dev/uniclaw.git
cd uniclaw && npm install

# 2. 启动 Chrome 9222（登录 Slack）
./start-chrome-debug.sh

# 3. 在 Chrome 中登录 Slack，打开你的 DM

# 4. iTerm 创建分屏并启动 Agent
# Cmd+D 创建分屏
# Pane 1: claude
# Pane 2: claude

# 5. 启动 UniClaw
./run.sh start
```

### 8.2 日常使用

```bash
# 只需启动 Chrome 和 Agent
./start-chrome-debug.sh  # Chrome 会复用已保存的登录状态
./run.sh start
```

### 8.3 常用命令

```bash
./run.sh start        # 启动 Agent
./run.sh stop         # 停止 Agent
./run.sh restart      # 重启 Agent（不重启 Chrome）
./run.sh stop-chrome  # 停止 Chrome 9223
./run.sh logs         # 查看实时日志
```

---

## 09 扩展性：不止于 Slack

UniClaw 的核心——Chrome DevTools Protocol——是**平台无关的**。

要支持新的聊天平台（Discord、Teams、飞书、钉钉），只需：

1. 在 Chrome 9222 中打开该平台网页版
2. 修改 `uniclaw-agent.js` 中的 CSS 选择器
3. 其余逻辑完全相同

无需申请 Bot 权限，无需配置 Webhook，无需处理平台特有的身份验证。

---

## 10 总结

UniClaw 证明了：**简单的技术栈可以解决复杂的问题**。

没有 WebSocket 服务器，没有消息队列，没有 Docker——就是一个 Node 脚本、两个 Chrome 窗口、AppleScript。但它实现了与 OpenClaw 同等的核心价值：让 AI 智能体通过熟悉的聊天界面，随时待命。

更进一步，UniClaw 通过**复用终端 Agent 生态**，获得了 OpenClaw 无法提供的优势：持久记忆、技能系统、代码库上下文。这些是价值连城的能力，而现在它们可以通过简单的聊天消息触发。

500行代码，给 Claude Code 装上了"虾爪"🦞。

---

**GitHub**: https://github.com/uniclaw-dev/uniclaw
**官网**: https://uniclaw.dev

---

*UniClaw 是一个开源项目，欢迎贡献代码和提出改进建议。*
