const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.OPERA_PREVIEW_PORT || 4326);
const html = path.join(root, 'dist/有戏新声_开发体验版.html');
if (!fs.existsSync(html)) { console.error('请先运行 npm run build'); process.exit(1); }
http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' }); fs.createReadStream(html).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`有戏新声体验页：http://127.0.0.1:${port}`));
