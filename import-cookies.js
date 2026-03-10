const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

const TARGET_PORT = 9223;
const COOKIES_FILE = '/Users/jesse/go/src/uniclaw/slack-cookies.json';

if (!fs.existsSync(COOKIES_FILE)) {
  console.log('No cookies file');
  process.exit(0);
}

const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));

http.get(`http://127.0.0.1:${TARGET_PORT}/json`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const pages = JSON.parse(data);
    const page = pages.find(p => p.type === 'page');
    if (!page) {
      console.log('No page found');
      process.exit(1);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: ++msgId, method: 'Network.enable' }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      if (resp.id === 1) {
        console.log(`Setting ${cookies.length} cookies...`);
        for (const c of cookies) {
          const params = {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: c.secure,
            httpOnly: c.httpOnly
          };
          ws.send(JSON.stringify({ id: ++msgId, method: 'Network.setCookie', params }));
        }
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 999,
            method: 'Page.navigate',
            params: { url: 'https://app.slack.com/client/T454XGSPR/D44BZGKDZ' }
          }));
        }, 1000);
      }
      if (resp.id === 999) {
        console.log('Navigated to Slack');
        setTimeout(() => { ws.close(); process.exit(0); }, 2000);
      }
    });
    setTimeout(() => { ws.close(); process.exit(0); }, 15000);
  });
});
