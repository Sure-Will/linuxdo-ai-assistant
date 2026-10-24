import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = 'test-results/preview/baseline.user.js';
export async function startServer(port = 0) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const route = url.pathname;
    if (route === '/build-stamp') {
      // 预览页轮询构建时间，安装文件变化后自动重载。
      const stamp = await fs.stat(path.join(base, 'dist/linuxdo-ai.user.js')).then(stat => stat.mtimeMs, () => 0);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ stamp, baseline: await fs.access(path.join(base, BASELINE)).then(() => true, () => false) }));
      return;
    }
    // 页面自身显示的 emoji 占位图；脚本读取图片时由夹具拦截，不经过这里。
    if (route.startsWith('/fixture-image/')) {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#f5b400"/></svg>');
      return;
    }
    const file = route === '/preview' || route === '/' ? 'test/preview.html'
      : route === '/preview-fixture.js' ? 'test/preview-fixture.js'
      : route === '/fixture.js' ? 'test/fixture.js' : route === '/linuxdo-ai.user.js' ? 'dist/linuxdo-ai.user.js'
      : route === '/baseline.user.js' ? BASELINE : route.startsWith('/t/') ? 'test/fixture.html' : null;
    if (!file) { response.writeHead(404); response.end(); return; }
    try {
      let body = await fs.readFile(path.join(base, file));
      // “改前”模式下，模拟页面改为加载保存的旧版本构建。
      if (file === 'test/fixture.html' && url.searchParams.get('build') === 'before') body = String(body).replace('/linuxdo-ai.user.js', '/baseline.user.js');
      response.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(500); response.end(file === BASELINE ? '没有找到改前构建。' : '请先构建脚本。'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/t/topic/1001` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, url } = await startServer(Number(process.env.PORT || 0));
  console.log(new URL('/preview', url).href);
  process.on('SIGINT', () => server.close()); process.on('SIGTERM', () => server.close());
}
