import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); } catch { res.writeHead(400).end(); return; }
  if (file === root) file = path.join(root,'index.html');
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(error,data) => {
    if(error) { res.writeHead(404).end('File not found'); return; }
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'}); res.end(data);
  });
});
server.listen(4173,'127.0.0.1',()=>process.stdout.write('ARES disponível em http://127.0.0.1:4173\n'));
