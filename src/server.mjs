import http from 'http'; import fs from 'fs'; import path from 'path';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
// Petit serveur statique ; onFrame reçoit les images envoyées par la page (POST /frame?i=N)
export function startServer(root, onFrame) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/frame') {
        const chunks = []; req.on('data', (c) => chunks.push(c));
        req.on('end', async () => { await onFrame(parseInt(url.searchParams.get('i'), 10), Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
        return;
      }
      const p = path.join(root, decodeURIComponent(url.pathname));
      if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
    }).listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
