import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFile(path.join(base, name), 'utf8');
const pkg = JSON.parse(await read('package.json'));
// 两台电脑的篡改猴都从 main 分支的安装文件检查更新；只有 @version 变高才会更新。
const REPO = 'https://github.com/Sure-Will/linuxdo-ai-assistant';
const RAW = 'https://raw.githubusercontent.com/Sure-Will/linuxdo-ai-assistant/main/dist/linuxdo-ai.user.js';
const upstream = await read('vendor/marked.esm.js');
const exportsMatch = upstream.match(/export\{([^}]+)\};?/);
const markedName = exportsMatch?.[1].match(/(?:^|,)\s*([\w$]+) as marked(?:,|$)/)?.[1];
if (!markedName) throw new Error('无法识别已固定版本的 marked 导出。');
const vendor = `const { marked } = (() => {\n${upstream.replace(exportsMatch[0], '').replace(/^\/\/# sourceMappingURL=.*$/gm, '')}\nreturn { marked: ${markedName} };\n})();`;
const stripModule = source => source.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const body = [vendor, stripModule(await read('src/core.js')), stripModule(await read('src/render.js')),
  `const styles = ${JSON.stringify(await read('src/style.css'))};`, stripModule(await read('src/app.js'))].join('\n\n');
const header = `// ==UserScript==
// @name         Linux.do AI 阅读助手
// @namespace    sure.linuxdo.ai
// @version      ${pkg.version}
// @description  自选模型，流式总结、连续追问、上下文范围和本地历史。适用于 Chrome 标签页与 PWA。
// @author       Sure
// @homepageURL  ${REPO}
// @updateURL    ${RAW}
// @downloadURL  ${RAW}
// @match        https://linux.do/*
// @run-at       document-idle
// @sandbox      DOM
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @connect      api.deepseek.com
// @connect      *
// ==/UserScript==`;
await fs.mkdir(path.join(base, 'dist'), { recursive: true });
await fs.writeFile(path.join(base, 'dist/linuxdo-ai.user.js'), `${header}\n\n(() => {\n'use strict';\n${body}\n})();\n`);
console.log(`已构建 dist/linuxdo-ai.user.js（${Buffer.byteLength(body)} 字节）`);
