import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export type Resolved = { ok: true; path: string } | { ok: false; status: 403 };

/** 요청 경로를 root 아래 파일 경로로 바꾼다. 경로 탈출 시도는 403. */
export function resolveServePath(root: string, rawUrl: string): Resolved {
  const deny: Resolved = { ok: false, status: 403 };
  const base = resolve(root);
  let p = rawUrl.split(/[?#]/)[0] ?? '';
  try {
    p = decodeURIComponent(p);
  } catch {
    return deny;
  }
  if (p.includes('\0') || p.includes('\\')|| p.includes(':')) return deny;
  if (!p.startsWith('/')) return deny;
  if (p.split('/').includes('..')) return deny;
  if (p.endsWith('/')) p += 'index.html';
  const full = resolve(join(base, p));
  if (full !== base && !full.startsWith(base + sep)) return deny;
  return { ok: true, path: full };
}

export function startServer(root: string, port: number) {
  const server = createServer((req, res) => {
    const headers = { 'Cache-Control': 'no-store' };
    const r = resolveServePath(root, req.url ?? '/');
    if (!r.ok) {
      res.writeHead(403, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
      return;
    }
    let file = r.path;
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!statSync(file).isFile()) throw new Error('not a file');
    } catch {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': contentType(file) });
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
  server.listen(port, () => console.log(`http://localhost:${port}`));
  return server;
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 4173;
  startServer('web', port);
}
