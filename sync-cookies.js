const WebSocket = require('ws');
const http = require('http');

const SOURCE_PORT = 9222;
const TARGET_PORT = 9223;

function getPages(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function exportCookies(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
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
        ws.close();
        resolve(resp.result?.cookies || []);
      }
    });
    setTimeout(() => reject(new Error('Timeout')), 5000);
  });
}

function importCookies(wsUrl, cookies) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    let setCount = 0;

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
            httpOnly: c.httpOnly,
            sameSite: c.sameSite
          };
          if (c.expires > 0) params.expires = c.expires;
          ws.send(JSON.stringify({ id: ++msgId, method: 'Network.setCookie', params }));
        }
        setTimeout(() => {
          ws.close();
          resolve(setCount);
        }, 2000);
      }
      if (resp.id > 1 && resp.id < 9999) {
        setCount++;
      }
    });
    setTimeout(() => { ws.close(); resolve(setCount); }, 10000);
  });
}

async function main() {
  try {
    const sourcePages = await getPages(SOURCE_PORT);
    const sourcePage = sourcePages.find(p => p.type === 'page');
    if (!sourcePage) throw new Error('No page on source port');

    const targetPages = await getPages(TARGET_PORT);
    const targetPage = targetPages.find(p => p.type === 'page');
    if (!targetPage) throw new Error('No page on target port');

    console.log('Exporting cookies from', SOURCE_PORT);
    const cookies = await exportCookies(sourcePage.webSocketDebuggerUrl);
    console.log(`Exported ${cookies.length} cookies`);

    console.log('Importing cookies to', TARGET_PORT);
    const count = await importCookies(targetPage.webSocketDebuggerUrl, cookies);
    console.log(`Imported ${count} cookies`);

    // Navigate to Slack
    const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 9999,
        method: 'Page.navigate',
        params: { url: 'https://app.slack.com/client/T454XGSPR' }
      }));
    });
    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      if (resp.id === 9999) {
        console.log('Navigated to Slack');
        setTimeout(() => { ws.close(); process.exit(0); }, 2000);
      }
    });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
