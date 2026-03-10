const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

const SOURCE_PORT = 9222;
const COOKIES_FILE = '/Users/jesse/go/src/uniclaw/slack-cookies.json';

http.get(`http://127.0.0.1:${SOURCE_PORT}/json`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const pages = JSON.parse(data);
    const page = pages.find(p => p.type === 'page');
    if (!page) {
      console.log('No page found on port', SOURCE_PORT);
      process.exit(1);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
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
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
        console.log(`Exported ${cookies.length} cookies`);
        ws.close();
        process.exit(0);
      }
    });
    setTimeout(() => { ws.close(); process.exit(1); }, 5000);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
