import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const packageVersion = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const resultsDir = path.join('test-results', packageVersion);
let browser, server, url;
before(async () => {
  ({ server, url } = await startServer());
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  await fs.mkdir(resultsDir, { recursive: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); });

async function setup(t, viewport = { width: 1440, height: 960 }, { settings = true, motion = false } = {}) {
  // 默认关闭动效，让时序断言稳定；动效另有专门测试。
  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Shanghai', reducedMotion: motion ? 'no-preference' : 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], '页面没有未捕获异常'));
  await page.goto(url);
  await page.locator('#linuxdo-ai-topic-button').waitFor({ state: 'attached' });
  if (await page.locator('#linuxdo-ai-topic-button').isVisible()) await page.locator('#linuxdo-ai-topic-button').click();
  else await page.locator('#linuxdo-ai-root .launcher').click();
  if (settings) await openSettings(page);
  return page;
}
async function openSettings(page) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
}
async function chooseScope(page, value) {
  await page.getByRole('button', { name: '选择阅读范围', exact: true }).click();
  await page.getByRole('menuitemradio', { name: { first: '仅首帖', '5': '前 5 帖', '10': '前 10 帖', '20': '前 20 帖', all: '全部帖子' }[value], exact: true }).click();
}
async function refreshContext(page) {
  await page.getByRole('button', { name: '选择阅读范围', exact: true }).click();
  await page.getByRole('button', { name: '更新帖子上下文', exact: true }).click();
}
async function configure(page) {
  await page.getByLabel('供应商', { exact: true }).selectOption('custom');
  await page.getByLabel('API 地址', { exact: false }).fill('https://model.test/v1');
  await page.getByLabel('API Key', { exact: false }).fill('fixture-only-key');
  await page.getByLabel('模型名', { exact: false }).fill('测试模型');
  await page.getByRole('button', { name: '保存', exact: true }).click();
}
async function done(page) { await page.locator('#linuxdo-ai-root .panel[aria-busy="false"] .message.assistant[data-status="complete"]').last().waitFor(); }
const summary = page => page.getByRole('button', { name: '总结这个话题', exact: true });
const input = page => page.getByRole('textbox', { name: '向 AI 提问', exact: true });

test('打开、重开、刷新及切换话题均不自动读取或总结，只有显式点击才请求', async t => {
  const page = await setup(t, { width: 1440, height: 756 }, { settings: false });
  assert.equal(await page.getByLabel('供应商', { exact: true }).isVisible(), false);
  assert.equal(await page.evaluate(() => fixture.requests.length + fixture.calls.length), 0);
  await openSettings(page); await configure(page);
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  await page.locator('#linuxdo-ai-topic-button').click();
  await page.getByRole('button', { name: '话题二', exact: true }).click();
  await page.reload(); await page.locator('#linuxdo-ai-topic-button').click();
  assert.equal(await page.evaluate(() => fixture.requests.length + fixture.calls.length), 0);
  await summary(page).click(); await done(page);
  assert.equal(await page.evaluate(() => fixture.requests.length), 1);
  assert.equal(await page.getByRole('status').isVisible(), false, '完成后不保留状态横幅');
  const reading = await page.locator('#linuxdo-ai-root .conversation').boundingBox();
  const frame = await page.locator('#linuxdo-ai-root .panel').boundingBox();
  const room = await page.evaluate(() => innerHeight - 24);
  assert.ok(Math.abs(frame.height - room * 2 / 3) <= 2, `面板约为可用高度的三分之二，实际 ${frame.height}/${room}px`);
  assert.ok(reading.height > frame.height * 0.6, `对话区占面板大部分空间，实际 ${reading.height}/${frame.height}px`);
  const sections = await page.locator('#linuxdo-ai-root .panel, #linuxdo-ai-root .head, #linuxdo-ai-root .conversation, #linuxdo-ai-root .composer').evaluateAll(els => els.map(el => ({ class: el.className, rect: el.getBoundingClientRect().toJSON() })));
  await fs.writeFile(path.join(resultsDir, 'panel-geometry.json'), JSON.stringify({ viewport: page.viewportSize(), sections }, null, 2));
  await page.screenshot({ path: path.join(resultsDir, 'compact-conversation-light.png') });
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'compact-conversation-dark.png') });
});

test('更多菜单与范围浮层可用，Esc 和点击外部只关闭浮层', async t => {
  const page = await setup(t, { width: 1440, height: 756 }, { settings: false });
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '新对话', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '历史', exact: true }).click();
  assert.equal(await page.getByLabel('选择历史对话', { exact: true }).isVisible(), true);
  await page.getByLabel('选择历史对话', { exact: true }).press('Escape');
  assert.equal(await page.locator('#linuxdo-ai-root .more-popover').isVisible(), false);
  assert.equal(await input(page).isVisible(), true);
  await page.getByRole('button', { name: '选择阅读范围', exact: true }).click();
  assert.equal(await page.getByRole('menuitemradio', { name: '仅首帖', exact: true }).isVisible(), true);
  assert.equal(await page.getByLabel('上下文范围', { exact: true }).count(), 0, '范围点击后直接列出选项');
  await page.screenshot({ path: path.join(resultsDir, 'scope-popover.png') });
  await input(page).click();
  assert.equal(await page.locator('#linuxdo-ai-root .scope-popover').isVisible(), false);
  await chooseScope(page, 'all');
  assert.equal(await page.locator('#linuxdo-ai-root .scope-button').innerText(), '全部帖子');
  assert.equal(await page.evaluate(() => fixture.requests.length + fixture.calls.length), 0);
});

test('右侧 AI 入口与阅读器同尺寸，并与下方两列对齐', async t => {
  const page = await setup(t);
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  const geometry = async () => {
    const boxes = await page.locator('.reader-mode-toggle, #linuxdo-ai-topic-button, .reply-to-post, .topic-notifications-tracking').evaluateAll(els => els.map(el => ({ ...el.getBoundingClientRect().toJSON(), id: el.id })));
    const [reader, ai, reply, bell] = boxes;
    assert.equal(ai.id, 'linuxdo-ai-topic-button');
    for (const [a, b] of [[ai.width, reader.width], [ai.height, reader.height], [ai.y, reader.y], [reader.x, reply.x], [ai.x, bell.x]]) assert.ok(Math.abs(a - b) < 0.5, `${a} 与 ${b} 对齐`);
    assert.equal(Math.round(ai.x - reader.right), 8);
    return boxes;
  };
  const light = await geometry();
  assert.equal(await page.locator('#topic-title button').count(), 0);
  await page.screenshot({ path: path.join(resultsDir, 'toolbar-light.png') });
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await geometry();
  await page.screenshot({ path: path.join(resultsDir, 'toolbar-dark.png') });
  const colors = await page.locator('.reader-mode-toggle, #linuxdo-ai-topic-button').evaluateAll(els => els.map(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]));
  assert.deepEqual(colors[0], colors[1]);
  await page.evaluate(() => { const row = document.querySelector('.timeline-controls'); const replacement = row.cloneNode(true); replacement.querySelector('#linuxdo-ai-topic-button').remove(); row.replaceWith(replacement); });
  await page.locator('#linuxdo-ai-topic-button').waitFor();
  assert.equal(await page.locator('#linuxdo-ai-topic-button').count(), 1);
  await page.getByRole('button', { name: '话题二', exact: true }).click();
  await page.locator('#linuxdo-ai-topic-button').click();
  assert.match(await page.locator('#linuxdo-ai-root .brand strong').getAttribute('title'), /第二个测试话题/);
  await fs.writeFile(path.join(resultsDir, 'toolbar-geometry.json'), JSON.stringify({ viewport: page.viewportSize(), boxes: light }, null, 2));
});

test('DeepSeek 官方预置可直接保存和调用，首次设置没有说明横幅', async t => {
  const page = await setup(t);
  assert.equal(await page.getByLabel('供应商', { exact: true }).inputValue(), 'deepseek');
  assert.equal(await page.getByLabel('模型', { exact: true }).inputValue(), 'deepseek-flash');
  assert.equal(await page.getByLabel('API 地址', { exact: true }).isVisible(), false);
  assert.equal(await page.getByRole('status').isVisible(), false);
  assert.equal(await page.locator('#linuxdo-ai-root .settings p, #linuxdo-ai-root .settings small').count(), 0);
  await page.screenshot({ path: path.join(resultsDir, 'deepseek-settings-light.png') });
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'deepseek-settings-dark.png') });
  await page.getByLabel('API Key', { exact: true }).fill('fixture-deepseek-key');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await summary(page).click(); await done(page);
  const request = await page.evaluate(() => fixture.requests[0]);
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(request.payload.model, 'deepseek-flash');
  const bundle = await fs.readFile(new URL('../dist/linuxdo-ai.user.js', import.meta.url), 'utf8');
  const domains = [...bundle.matchAll(/^\/\/ @connect\s+(\S+)/gm)].map(match => match[1]);
  const host = new URL(request.url).hostname;
  assert.ok(domains.some(domain => domain !== '*' && (domain === host || host.endsWith(`.${domain}`))), '内置供应商的实际请求域名必须显式声明，不能依赖 @connect * 的额外确认');
  await openSettings(page);
  await page.getByLabel('供应商', { exact: true }).selectOption('custom');
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '', '切换供应商不携带原服务商密钥');
  await configure(page); await summary(page).click(); await done(page);
  const custom = await page.evaluate(() => fixture.requests.at(-1).payload);
  assert.ok(!Object.hasOwn(custom, 'reasoning_effort') && !Object.hasOwn(custom, 'thinking'), '切换通用供应商不沿用 DeepSeek 思考参数');
});

test('工具栏隐藏时保留窄屏图标入口，短窗口设置仍可保存', async t => {
  const page = await setup(t);
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await page.setViewportSize({ width: 900, height: 600 });
  const launcher = page.locator('#linuxdo-ai-root .launcher');
  await launcher.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 390, height: 500 });
  await launcher.click();
  await openSettings(page);
  assert.equal(await page.getByLabel('供应商', { exact: true }).isVisible(), true);
  await page.screenshot({ path: path.join(resultsDir, 'deepseek-settings-narrow.png') });
  const panel = await page.locator('#linuxdo-ai-root .panel').boundingBox();
  assert.equal(panel.x, 0); assert.equal(panel.width, 390);
  assert.equal(await page.locator('#linuxdo-ai-root .panel').evaluate(el => el.scrollWidth > el.clientWidth), false);
  await page.getByLabel('API Key', { exact: true }).fill('fixture-deepseek-key');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(await input(page).isVisible(), true);
});

test('设置、默认总结、追问与刷新恢复形成完整闭环', async t => {
  const page = await setup(t);
  assert.equal(await page.getByLabel('API Key', { exact: false }).getAttribute('type'), 'password');
  assert.equal(await page.evaluate(() => fixture.requests.length), 0);
  await configure(page); await summary(page).click(); await done(page);
  const first = await page.evaluate(() => fixture.requests[0].payload);
  assert.match(first.messages[1].content, /5\/47/);
  assert.ok(!first.messages[1].content.includes('测试楼层 6。'));
  assert.equal(first.stream, true);
  await input(page).fill('补充其中的风险'); await input(page).press('Control+Enter'); await done(page);
  const second = await page.evaluate(() => fixture.requests.at(-1).payload);
  assert.equal(second.messages.at(-1).content, '补充其中的风险');
  assert.equal(second.messages.filter(m => m.role === 'assistant').length, 2);
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 4);
  await page.reload(); await page.locator('#linuxdo-ai-topic-button').click();
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 4);
  assert.equal(await page.evaluate(() => fixture.requests.length), 0, '恢复历史不自动再次调用模型');
  assert.equal(await page.getByLabel('API Key', { exact: false }).inputValue(), '', '离开设置后不保留 DOM 中的 Key');
  await openSettings(page);
  assert.equal(await page.getByLabel('供应商', { exact: true }).inputValue(), 'custom');
  assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), 'https://model.test/v1/chat/completions');
  assert.equal(await page.getByLabel('模型名', { exact: true }).inputValue(), '测试模型');
});

test('全部范围分批读齐，缺楼层时不发送模型请求', async t => {
  const page = await setup(t); await configure(page);
  await chooseScope(page, 'all');
  await refreshContext(page);
  await page.getByRole('status').filter({ hasText: '已读取 47/47' }).waitFor();
  assert.equal(await page.evaluate(() => fixture.requests.length), 0);
  const calls = await page.evaluate(() => fixture.calls);
  assert.equal(calls.length, 4);
  assert.equal(new URL(calls[1], 'https://linux.do').searchParams.getAll('post_ids[]').length, 20);
  await summary(page).click(); await done(page);
  assert.match(await page.evaluate(() => fixture.requests[0].payload.messages[1].content), /测试楼层 47/);
  await page.evaluate(() => fixture.setMode('missing'));
  await refreshContext(page);
  await page.getByRole('status').filter({ hasText: '只读到' }).waitFor();
  await summary(page).click(); await page.getByRole('status').filter({ hasText: '只读到' }).waitFor();
  assert.equal(await page.evaluate(() => fixture.requests.length), 1);
});

test('生成中切换话题会取消旧请求，历史和上下文不串帖', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('slow'));
  await summary(page).click(); await page.locator('#linuxdo-ai-root .assistant .body').filter({ hasText: '主要内容' }).waitFor();
  await page.getByRole('button', { name: '话题二', exact: true }).click();
  await page.locator('#linuxdo-ai-root .brand strong[title*="第二个测试话题"]').waitFor();
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 0);
  assert.equal(await page.evaluate(() => fixture.requests[0].aborted), true);
  await page.evaluate(() => fixture.setMode('normal'));
  await summary(page).click(); await done(page);
  const messages = await page.evaluate(() => fixture.requests.at(-1).payload.messages);
  assert.match(messages[1].content, /话题 1002/); assert.ok(!JSON.stringify(messages).includes('话题 1001'));
  await page.getByRole('button', { name: '话题一', exact: true }).click();
  await page.locator('#linuxdo-ai-root .brand strong[title*="长帖阅读验收"]').waitFor();
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 2);
  assert.match(await page.locator('#linuxdo-ai-root .message-note').allTextContents().then(v => v.join('')), /停止/);
});

test('生成中关闭面板不会中断，重新打开可看到完整回答', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('slow'));
  await summary(page).click(); await page.locator('#linuxdo-ai-root .assistant .body').filter({ hasText: '主要内容' }).waitFor();
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  await page.locator('#linuxdo-ai-root .panel').waitFor({ state: 'hidden' });
  await page.locator('#linuxdo-ai-root .panel[aria-busy="false"]').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => fixture.requests[0].aborted), false);
  await page.locator('#linuxdo-ai-topic-button').click(); await done(page);
  assert.equal(await page.evaluate(() => fixture.requests.length), 1);
  assert.doesNotMatch(await page.locator('#linuxdo-ai-root .message-note').allTextContents().then(v => v.join('')), /停止/);
});

test('停止、重试、新对话和历史切换不会重复问题', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('slow'));
  await summary(page).click(); await page.locator('#linuxdo-ai-root .assistant .body').filter({ hasText: '主要内容' }).waitFor();
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.locator('#linuxdo-ai-root .message-note').filter({ hasText: '已停止' }).waitFor();
  assert.equal(await page.evaluate(() => fixture.requests[0].aborted), true);
  await page.evaluate(() => fixture.setMode('normal'));
  await page.getByRole('button', { name: '重新生成', exact: true }).click(); await done(page);
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 2);
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 0);
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('button', { name: '历史', exact: true }).click();
  await page.getByLabel('选择历史对话', { exact: true }).selectOption({ index: 1 });
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 2);
});

test('思考过程流式展开，正文开始后收起，可回看且不发回模型', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('thinking'));
  const thinking = page.locator('#linuxdo-ai-root .assistant .thinking');
  await summary(page).click();
  await thinking.locator('.thinking-text').filter({ hasText: '首帖' }).waitFor();
  assert.equal(await thinking.evaluate(node => node.open), true, '思考阶段自动展开');
  assert.equal(await thinking.locator('summary').innerText(), '正在思考…');
  assert.equal(await page.locator('#linuxdo-ai-root .assistant .typing').isVisible(), false, '有思考内容时不再显示等待圆点');
  assert.equal(await page.locator('#linuxdo-ai-root .status').isVisible(), false);
  await done(page);
  assert.equal(await thinking.evaluate(node => node.open), false, '正文开始后自动收起');
  assert.match(await thinking.locator('summary').innerText(), /^已思考 \d+ 秒$/);
  await thinking.locator('summary').click();
  assert.match(await thinking.locator('.thinking-text').innerText(), /首帖[\s\S]*已确认的事实/);
  await page.screenshot({ path: path.join(resultsDir, 'thinking-expanded.png') });
  await page.evaluate(() => fixture.setMode('normal'));
  await input(page).fill('谁更谨慎？');
  await page.getByRole('button', { name: '发送问题', exact: true }).click(); await done(page);
  assert.ok(!JSON.stringify(await page.evaluate(() => fixture.requests.at(-1).payload.messages)).includes('首帖把版本号'), '思考过程不进入后续请求');
  assert.equal(await thinking.count(), 2);
  assert.equal(await thinking.nth(1).isVisible(), false, '未开启思考的回答不显示思考块');
  await page.reload(); await page.locator('#linuxdo-ai-topic-button').click();
  assert.match(await thinking.first().locator('summary').innerText(), /^已思考 \d+ 秒$/, '刷新后仍可回看思考过程');
});

test('导出图片入口在三个点右侧，生成浅色和深色 PNG，可复制和保存', async t => {
  const page = await setup(t); await configure(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const exportButton = page.getByRole('button', { name: '导出图片', exact: true });
  assert.deepEqual(await page.locator('#linuxdo-ai-root .head .actions > button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['更多操作', '导出图片', '关闭 AI 面板']);
  assert.equal(await exportButton.isDisabled(), true, '没有完整回答时不能导出');
  await summary(page).click(); await done(page);
  await input(page).fill('谁更谨慎？');
  await page.getByRole('button', { name: '发送问题', exact: true }).click(); await done(page);
  const before = await page.evaluate(() => fixture.requests.length);
  await exportButton.click();
  assert.equal(await page.locator('#linuxdo-ai-root .brand strong').innerText(), '导出图片');
  const canvas = page.locator('#linuxdo-ai-root .export-preview canvas');
  for (const [label, rgb, file] of [['浅色', [255, 255, 255], 'export-light.png'], ['深色', [30, 30, 30], 'export-dark.png']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.locator(`#linuxdo-ai-root .export-preview[aria-busy="false"] canvas[aria-label*="${label}"]`).waitFor();
    assert.equal(await canvas.evaluate(node => node.width), 750, '375px 卡片按 2 倍像素输出');
    assert.deepEqual(await canvas.evaluate(node => [...node.getContext('2d').getImageData(4, 4, 1, 1).data.slice(0, 3)]), rgb, '画布未被污染且背景正确');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '保存图片', exact: true }).click()]);
    assert.match(download.suggestedFilename(), /^linuxdo-1001-\d{8}-\d{4}\.png$/);
    await download.saveAs(path.join(resultsDir, file));
  }
  await page.getByRole('button', { name: '复制图片', exact: true }).click();
  await page.getByRole('button', { name: '已复制', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(async () => (await navigator.clipboard.read()).flatMap(item => item.types)), ['image/png']);
  assert.equal(await page.evaluate(() => fixture.requests.length), before, '导出不请求模型');
  await page.screenshot({ path: path.join(resultsDir, 'export-view.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#linuxdo-ai-root .brand strong').innerText(), '话题总结');
  await openSettings(page);
  assert.equal(await exportButton.isVisible(), false, '设置页不显示导出入口');
});

test('帖子操作栏常驻点赞、回复、收藏、图片、Boost、更多，原生状态与新楼层保持正常', async t => {
  const page = await setup(t, undefined, { settings: false });
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  const menus = page.locator('main nav.post-controls .actions');
  await page.locator('main .linuxdo-ai-post-more').nth(2).waitFor();
  const visibleOrder = menu => menu.locator('button:visible').evaluateAll(buttons => buttons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(button => button.getAttribute('aria-label')));
  assert.deepEqual(await visibleOrder(menus.first()), ['点赞', '回复', '收藏', '把这一楼导出为图片', 'Boost', '更多帖子操作']);
  assert.equal(await menus.first().locator('.post-action-menu__reply .d-button-label').isVisible(), false, '回复只保留图标');
  assert.equal(await menus.first().locator('.post-action-menu__reply svg').isVisible(), true);
  await menus.first().getByRole('button', { name: '点赞', exact: true }).click();
  await menus.first().getByRole('button', { name: '收藏', exact: true }).click();
  await menus.first().getByRole('button', { name: 'Boost', exact: true }).click();
  assert.equal(await menus.first().getByRole('button', { name: '点赞', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await menus.first().getByRole('button', { name: '收藏', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => fixture.rerenderMenu(0));
  await menus.first().locator('.linuxdo-ai-post-more').waitFor();
  assert.deepEqual(await visibleOrder(menus.first()), ['点赞', '回复', '收藏', '把这一楼导出为图片', 'Boost', '更多帖子操作']);
  assert.equal(await menus.first().getByRole('button', { name: '收藏', exact: true }).getAttribute('aria-pressed'), 'true', '重绘保持原生收藏状态');
  await menus.first().getByRole('button', { name: '回复', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => fixture.actionClicks), ['like', 'bookmark', 'boost', 'reply'], '点击只调用一次原生操作');
  await page.evaluate(() => fixture.addPost());
  await page.locator('main .linuxdo-ai-post-more').nth(3).waitFor();
  assert.deepEqual(await visibleOrder(menus.nth(3)), ['点赞', '回复', '收藏', '把这一楼导出为图片', 'Boost', '更多帖子操作']);
  assert.equal(await page.locator('main [data-ai-post-expanded]').count(), 0, '新楼层不自动展开');
  assert.equal(await page.evaluate(() => fixture.menuClicks), 4, '每楼仅初始化一次原生控件');
  assert.equal(await page.evaluate(() => fixture.calls.length + fixture.requests.length), 0, '整理操作栏不读取帖子也不请求模型');
  await page.screenshot({ path: path.join(resultsDir, 'post-actions-light.png') });
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'post-actions-dark.png') });
  await page.evaluate(() => { document.body.classList.add('archetype-private_message'); fixture.addPost(); });
  await menus.nth(4).locator('.linuxdo-ai-post-export').waitFor();
  assert.equal(await menus.nth(4).locator('.show-more-actions').isVisible(), true, '私信保留原生折叠入口');
  assert.equal(await menus.nth(4).locator('.linuxdo-ai-post-more').count(), 0);
  assert.equal(await page.evaluate(() => fixture.menuClicks), 4, '私信不自动读取已读名单');
});

test('帖子更多在原位横向展开原生图标，保持展开且不影响其他楼层', async t => {
  const page = await setup(t, undefined, { settings: false });
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  const actions = page.locator('main nav.post-controls .actions'), more = page.locator('main .linuxdo-ai-post-more');
  await more.nth(2).waitFor();
  await actions.first().getByRole('button', { name: '点赞', exact: true }).focus();
  for (const label of ['回复', '收藏', '把这一楼导出为图片', 'Boost', '更多帖子操作']) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), label);
  }
  await page.keyboard.press('Enter');
  const copy = actions.first().locator('.post-action-menu__copy-link');
  await copy.waitFor();
  const baseline = await actions.first().locator('.post-action-menu__reply').boundingBox();
  const copyBox = await copy.boundingBox();
  assert.ok(Math.abs(copyBox.y + copyBox.height / 2 - baseline.y - baseline.height / 2) < 1, '更多应在操作栏原位置横向展开，不弹出下拉浮层');
  assert.equal(await more.first().isVisible(), false, '按原站行为，展开后省去更多按钮');
  assert.equal(await page.locator('.linuxdo-ai-post-menu-surface').count(), 0);
  const rowLabels = await actions.first().locator('button:visible').evaluateAll(nodes => nodes.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(n => n.getAttribute('aria-label')));
  assert.deepEqual(rowLabels, ['点赞', '回复', '收藏', '把这一楼导出为图片', 'Boost', '复制链接', '举报', '编辑', '删除']);
  await page.locator('#topic-title').click();
  assert.equal(await copy.isVisible(), true, '点击外部保持展开');
  await copy.click();
  assert.deepEqual(await page.evaluate(() => fixture.actionClicks), ['copy-link']);
  assert.equal(await copy.isVisible(), true, '使用原生操作后保持展开');
  await page.screenshot({ path: path.join(resultsDir, 'post-expanded-light.png') });
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'post-expanded-dark.png') });
  await actions.first().getByRole('button', { name: '点赞', exact: true }).focus();
  for (const label of rowLabels.slice(1)) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), label);
  }
  await page.keyboard.press('Tab');
  assert.equal(await actions.first().evaluate(n => n.contains(document.activeElement)), false, '展开后 Tab 能离开当前操作栏');
  await page.evaluate(() => fixture.rerenderMenu(0));
  await actions.first().locator('.post-action-menu__flag').waitFor();
  assert.equal(await more.first().isVisible(), false, '重绘不重新收起');
  await more.nth(1).click();
  assert.equal(await actions.first().locator('.post-action-menu__flag').isVisible(), true, '另一楼展开不影响本楼');
  assert.equal(await actions.nth(1).locator('.post-action-menu__flag').isVisible(), true);
  await page.evaluate(() => fixture.addPost());
  await more.nth(3).waitFor();
  assert.equal(await actions.nth(3).locator('.post-action-menu__flag').isVisible(), false, '新楼层仍默认收起');
  assert.equal(await page.evaluate(() => fixture.calls.length + fixture.requests.length), 0);
});

test('回复图标与原生纯图标按钮同宽居中，图文按钮保留文字间距作为对照', async t => {
  const page = await setup(t, undefined, { settings: false });
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  const actions = page.locator('main nav.post-controls .actions').first();
  await actions.locator('.linuxdo-ai-post-more').waitFor();
  const measured = await actions.evaluate(row => {
    const measure = node => {
      const r = node.getBoundingClientRect(), i = node.querySelector('svg').getBoundingClientRect();
      return { width: r.width, offset: i.x + i.width / 2 - r.x - r.width / 2 };
    };
    return { reply: measure(row.querySelector('.post-action-menu__reply')), bookmark: measure(row.querySelector('.post-action-menu__bookmark')) };
  });
  assert.ok(Math.abs(measured.reply.width - measured.bookmark.width) < 1, `回复与收藏按钮应同宽，实际 ${JSON.stringify(measured)}`);
  assert.ok(Math.abs(measured.reply.offset) < 0.5, '隐藏文字后回复图标应居中');
  assert.equal(await actions.locator('.post-action-menu__reply .d-button-label').isVisible(), false);
  const controlMargin = await page.evaluate(() => {
    const control = document.querySelector('.post-action-menu__reply').cloneNode(true);
    control.removeAttribute('data-ai-post-kind'); document.body.append(control);
    const margin = parseFloat(getComputedStyle(control.querySelector('svg')).marginRight); control.remove(); return margin;
  });
  assert.ok(controlMargin > 0, '对照样式确实包含图文按钮间距，回归测试能检出它');
  await fs.writeFile(path.join(resultsDir, 'reply-icon-geometry.json'), JSON.stringify(measured, null, 2));
});

test('帖子操作栏在窄屏原位换行，无权限的按钮不补造', async t => {
  const page = await setup(t, { width: 320, height: 600 }, { settings: false });
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  const actions = page.locator('main nav.post-controls .actions').first();
  await actions.locator('.linuxdo-ai-post-export').waitFor();
  await actions.locator('.post-action-menu__boost').waitFor();
  await actions.evaluate(node => node.scrollIntoView({ block: 'center' }));
  const collapsedBoxes = await actions.locator('button:visible').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().toJSON()));
  assert.ok(collapsedBoxes.every(r => r.x >= 0 && r.right <= 320), '六个常驻按钮完整位于窄屏内');
  await page.screenshot({ path: path.join(resultsDir, 'post-actions-narrow.png') });
  await actions.locator('.linuxdo-ai-post-more').click();
  await actions.locator('.post-action-menu__flag').waitFor();
  const boxes = await actions.locator('button:visible').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().toJSON()));
  assert.ok(boxes.every(r => r.x >= 0 && r.right <= 320), '展开后的原生按钮完整位于窄屏内');
  await page.screenshot({ path: path.join(resultsDir, 'post-expanded-narrow.png') });
  await actions.locator('.post-action-menu__bookmark').evaluate(node => node.remove());
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await actions.locator('.post-action-menu__bookmark').count(), 0, '原生不允许收藏时不创建替代按钮');
  await actions.locator('.post-action-menu__boost').evaluate(node => node.remove());
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await actions.locator('.post-action-menu__boost').count(), 0, '原站不显示 Boost 时不创建替代按钮');
  await page.getByRole('button', { name: '话题二', exact: true }).click();
  await actions.locator('.linuxdo-ai-post-more').waitFor();
  assert.equal(await actions.locator('.post-action-menu__flag').isVisible(), false, '切换话题默认收起');
});

test('每楼常驻图片按钮可直接导出，重绘后补回，导出时图片转进图里且不执行帖子脚本', async t => {
  const page = await setup(t, undefined, { settings: false });
  const exports = page.locator('main .post-action-menu__copy-link + .linuxdo-ai-post-export');
  await exports.nth(2).waitFor();
  assert.equal(await page.locator('main .linuxdo-ai-post-export').count(), 3, '每楼一个且不重复');
  await page.evaluate(() => fixture.rerenderMenu(1));
  await exports.nth(2).waitFor();
  assert.equal(await page.locator('main .linuxdo-ai-post-export').count(), 3, '重绘后补回');
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  await exports.nth(1).click();
  assert.equal(await page.locator('main .post-action-menu__copy-link').nth(1).isVisible(), false, '常驻图片按钮直接导出，其余操作保持收起');
  assert.equal(await page.locator('main .linuxdo-ai-post-more').nth(1).isVisible(), true);
  assert.equal(await page.locator('#linuxdo-ai-root .brand strong').innerText(), '导出图片');
  const canvas = page.locator('#linuxdo-ai-root .export-preview[aria-busy="false"] canvas');
  await canvas.waitFor();
  assert.deepEqual(await page.evaluate(() => fixture.calls.filter(path => path.startsWith('/posts/'))), ['/posts/2.json'], '只读取被点击的这一楼');
  const images = await page.evaluate(() => fixture.imageRequests);
  assert.ok(images.some(url => url.includes('/fixture-image/emoji/')) && images.some(url => url.includes('/fixture-image/avatar/96.png')), '同站 emoji 与头像直接读取');
  assert.ok(images.filter(url => url === 'https://cdn.example.test/optimized/table.png').length >= 2, '跨域图片在 CORS 失败后改用油猴请求');
  assert.equal(images.filter(url => url.includes('/original/')).length, 0, '只取正文中显示的优化图');
  assert.equal(await page.evaluate(() => window.fixturePostXss), undefined, '帖子里的脚本与事件不执行');
  assert.equal(await page.locator('#linuxdo-ai-root .status').isVisible(), false, '单张图片失败不阻止导出');
  const height = await canvas.evaluate(node => node.height);
  assert.ok(height > 1400, `图片与正文已排入卡片（高 ${height}px）`);
  for (const [label, file] of [['浅色', 'post-export-light.png'], ['深色', 'post-export-dark.png']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.locator(`#linuxdo-ai-root .export-preview[aria-busy="false"] canvas[aria-label*="${label}"]`).waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '保存图片', exact: true }).click()]);
    assert.match(download.suggestedFilename(), /^linuxdo-1001-post-\d{8}-\d{4}\.png$/);
    await download.saveAs(path.join(resultsDir, file));
  }
  assert.equal(await page.evaluate(() => fixture.calls.filter(path => path.startsWith('/posts/')).length), 1, '切换背景不重新读取帖子');
  await page.evaluate(() => fixture.setMode('forum-error'));
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  await exports.nth(2).click();
  await page.locator('#linuxdo-ai-root .status.error').filter({ hasText: '重新登录或验证' }).waitFor();
  assert.equal(await page.locator('#linuxdo-ai-root .export-preview canvas').count(), 0);
  assert.equal(await page.evaluate(() => fixture.requests.length), 0, '导出帖子不请求模型');
});

test('论坛验证和模型网络错误不会触发自动重试', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('forum-error'));
  await summary(page).click(); await page.getByRole('status').filter({ hasText: '重新登录或验证' }).waitFor();
  assert.equal(await page.evaluate(() => fixture.requests.length), 0);
  assert.equal(await page.evaluate(() => fixture.calls.length), 1);
  await page.evaluate(() => fixture.setMode('api-error'));
  await summary(page).click(); await page.locator('#linuxdo-ai-root .message-note').filter({ hasText: '模型连接失败' }).waitFor();
  assert.equal(await page.evaluate(() => fixture.requests.length), 1);
});

test('Markdown 中的 HTML、事件、危险链接不会运行，图片不会自动加载', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('xss'));
  await summary(page).click(); await done(page);
  assert.equal(await page.evaluate(() => window.fixtureXss), undefined);
  assert.equal(await page.locator('#linuxdo-ai-root .body script, #linuxdo-ai-root .body img, #linuxdo-ai-root .body iframe').count(), 0);
  const links = await page.locator('#linuxdo-ai-root .body a').evaluateAll(nodes => nodes.map(node => node.href));
  assert.ok(links.every(href => /^https?:/.test(href)));
  assert.equal(await page.locator('#linuxdo-ai-root .body strong').last().textContent(), '正常文字');
});

test('明暗色与窄窗口布局可用，长文本不会挤出面板', async t => {
  const page = await setup(t); await configure(page);
  await chooseScope(page, 'all');
  await summary(page).click(); await done(page);
  await page.screenshot({ path: path.join(resultsDir, 'light-desktop.png') });
  await page.getByRole('button', { name: '切换明暗', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'dark-desktop.png') });
  const bg = await page.locator('#linuxdo-ai-root .panel').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(bg, 'rgb(34, 34, 34)');
  await page.setViewportSize({ width: 390, height: 720 });
  await page.screenshot({ path: path.join(resultsDir, 'dark-narrow.png') });
  const box = await page.locator('#linuxdo-ai-root .panel').boundingBox();
  assert.equal(box.x, 0); assert.equal(box.width, 390);
  const overflow = await page.locator('#linuxdo-ai-root .panel').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 568 });
    assert.equal(await page.locator('#linuxdo-ai-root .panel').evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: path.join(resultsDir, `chat-${width}.png`) });
  }
  await openSettings(page);
  await page.screenshot({ path: path.join(resultsDir, 'settings-narrow.png') });
  await page.getByLabel('模型名', { exact: false }).press('Escape');
  assert.equal(await input(page).isVisible(), true);
});

test('Enter 发送，Shift + Enter 换行，中文选词不提交', async t => {
  const page = await setup(t); await configure(page);
  await input(page).fill('第一行'); await input(page).press('Shift+Enter');
  await input(page).pressSequentially('第二行');
  assert.equal(await input(page).inputValue(), '第一行\n第二行');
  assert.equal(await page.evaluate(() => fixture.requests.length), 0);
  await input(page).evaluate(el => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
  });
  assert.equal(await page.evaluate(() => fixture.requests.length), 0);
  await input(page).press('Enter'); await done(page);
  assert.equal(await page.evaluate(() => fixture.requests[0].payload.messages.at(-1).content), '第一行\n第二行');
});

test('窗口变宽后输入框按新宽度恢复高度', async t => {
  const page = await setup(t, { width: 140, height: 700 }, { settings: false });
  const height = () => input(page).evaluate(el => el.getBoundingClientRect().height);
  assert.ok(await height() > 60, '极窄面板中占位文字换行撑高输入框');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForFunction(() => document.querySelector('#linuxdo-ai-root').shadowRoot.querySelector('textarea').getBoundingClientRect().height < 50);
  assert.equal(Math.round(await height()), 40);
});

test('生成中不自动滚动，阅读位置不被拉动，回到最新只跳一次', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('long'));
  await summary(page).click();
  await page.waitForFunction(() => {
    const scroll = document.querySelector('#linuxdo-ai-root').shadowRoot.querySelector('.conversation');
    return scroll.scrollHeight > scroll.clientHeight + 500;
  });
  const scroll = page.locator('#linuxdo-ai-root .conversation');
  const top = () => scroll.evaluate(el => el.scrollTop);
  assert.ok(await top() < 30, '回答在问题下方原地生成，不跟随到底部');
  await page.getByRole('button', { name: '回到最新', exact: true }).waitFor();
  await scroll.evaluate(el => { el.scrollTop = 120; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(250);
  assert.equal(await top(), 120, '停在用户滚到的位置');
  await page.getByRole('button', { name: '回到最新', exact: true }).click();
  const jumped = await top();
  assert.ok(jumped > 200);
  await page.waitForTimeout(250);
  assert.equal(await top(), jumped, '跳到最新后不进入跟随');
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.locator('#linuxdo-ai-root .message-note').filter({ hasText: '已停止' }).waitFor();
});

test('追问时新问题置顶，生成全程视图不动', async t => {
  const page = await setup(t); await configure(page);
  await summary(page).click(); await done(page);
  await page.evaluate(() => fixture.setMode('slow'));
  await input(page).fill('继续说说'); await input(page).press('Enter');
  await page.locator('#linuxdo-ai-root .assistant[data-status="generating"] .body').filter({ hasText: '主要内容' }).waitFor();
  const scroll = page.locator('#linuxdo-ai-root .conversation');
  const snapshot = () => scroll.evaluate(el => {
    const questions = el.querySelectorAll('.message.user');
    return { top: el.scrollTop, question: Math.round(questions[questions.length - 1].getBoundingClientRect().top - el.getBoundingClientRect().top) };
  });
  const first = await snapshot();
  assert.ok(first.top > 0, '已有对话时向下滚动到新问题');
  assert.ok(Math.abs(first.question - 10) <= 1, `新问题贴近对话区顶部（实际 ${first.question}px）`);
  await page.waitForTimeout(500);
  assert.deepEqual(await snapshot(), first);
  await done(page);
  assert.deepEqual(await snapshot(), first, '生成结束后位置不变');
});

test('生成中选中文字时暂停重绘，取消选择后补上内容', async t => {
  const page = await setup(t); await configure(page); await page.evaluate(() => fixture.setMode('slow'));
  await summary(page).click();
  const body = page.locator('#linuxdo-ai-root .assistant[data-status="generating"] .body');
  await body.filter({ hasText: '主要内容' }).waitFor();
  const select = () => page.evaluate(() => {
    const root = document.querySelector('#linuxdo-ai-root').shadowRoot;
    const range = document.createRange(); range.selectNodeContents(root.querySelector('.assistant .body').firstElementChild);
    const selection = root.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  const chosen = await select();
  assert.ok(chosen.length > 0);
  const length = (await body.textContent()).length;
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.querySelector('#linuxdo-ai-root').shadowRoot.getSelection().toString()), chosen);
  assert.equal((await body.textContent()).length, length, '选中期间不替换回答节点');
  await page.evaluate(() => document.querySelector('#linuxdo-ai-root').shadowRoot.getSelection().removeAllRanges());
  await done(page);
  assert.ok((await page.locator('#linuxdo-ai-root .assistant .body').textContent()).length > length);
});

test('动效开启时浮层为毛玻璃，点击关闭先淡出，Esc 立即关闭，淡出中可重新打开', async t => {
  const page = await setup(t, undefined, { settings: false, motion: true });
  const panel = page.locator('#linuxdo-ai-root .panel');
  const hidden = () => panel.evaluate(el => el.hidden);
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('button', { name: '新对话', exact: true }).waitFor();
  assert.match(await page.locator('#linuxdo-ai-root .more-popover').evaluate(el => getComputedStyle(el).backdropFilter), /blur/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  assert.equal(await hidden(), false, '点击关闭时先淡出');
  await page.locator('#linuxdo-ai-topic-button').click();
  await page.waitForTimeout(250);
  assert.equal(await hidden(), false, '淡出中重新打开不会被延迟隐藏');
  assert.equal(await panel.evaluate(el => el.hasAttribute('data-closing')), false);
  await page.getByRole('button', { name: '关闭 AI 面板', exact: true }).click();
  await panel.waitFor({ state: 'hidden' });
  await page.locator('#linuxdo-ai-topic-button').click(); await panel.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await hidden(), true, 'Esc 关闭不播放动画');
});

test('拖动顶边调高度、左边调宽度，有上下限，可双击恢复、键盘调整并在刷新后保留', async t => {
  const page = await setup(t, { width: 1280, height: 900 }, { settings: false });
  const panel = page.locator('#linuxdo-ai-root .panel');
  const box = () => panel.boundingBox();
  const drag = async (selector, dx, dy) => {
    const handle = await page.locator(`#linuxdo-ai-root ${selector}`).boundingBox();
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2); await page.mouse.move(x + dx, y + dy); await page.mouse.up();
  };
  const start = await box();
  assert.ok(Math.abs(start.height - 876 * 2 / 3) <= 2);
  await drag('.resize-top', 0, -150);
  assert.ok(Math.abs((await box()).height - (start.height + 150)) <= 2, '向上拖动增加高度');
  assert.ok(Math.abs((await box()).y + (await box()).height - (start.y + start.height)) <= 1, '底边保持不动');
  await drag('.resize-top', 0, -2000);
  assert.ok(Math.abs((await box()).height - 876) <= 2, '高度不超过可用高度');
  await drag('.resize-top', 0, 2000);
  assert.ok(Math.abs((await box()).height - 320) <= 2, '高度不低于 320px');
  await drag('.resize-left', -120, 0);
  assert.ok(Math.abs((await box()).width - 560) <= 2, '向左拖动增加宽度');
  await drag('.resize-left', 2000, 0);
  assert.ok(Math.abs((await box()).width - 360) <= 2, '宽度不低于 360px');
  await drag('.resize-corner', -100, -100);
  assert.deepEqual([Math.round((await box()).width), Math.round((await box()).height)], [460, 420]);
  const heightHandle = page.getByRole('separator', { name: '调整面板高度', exact: true });
  await heightHandle.focus(); await heightHandle.press('ArrowUp');
  assert.equal(await heightHandle.getAttribute('aria-valuenow'), '444');
  await page.reload(); await page.locator('#linuxdo-ai-topic-button').click();
  assert.deepEqual([Math.round((await box()).width), Math.round((await box()).height)], [460, 444], '刷新后保留大小');
  await page.locator('#linuxdo-ai-root .resize-top').dblclick();
  await page.locator('#linuxdo-ai-root .resize-left').dblclick();
  assert.deepEqual([Math.round((await box()).width), Math.round((await box()).height)], [440, Math.round(start.height)], '双击恢复默认');
  await page.setViewportSize({ width: 500, height: 900 });
  assert.equal(await page.locator('#linuxdo-ai-root .resize-top').isVisible(), false, '窄屏全屏时不提供拖动');
});

test('交互预览覆盖五种状态、菜单、主题和窄屏，所有资源均在本地', async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(url).origin) external.push(request.url()); });
  await page.goto(new URL('/preview', url).href);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: '讨论要点', exact: true }).waitFor();
  await page.screenshot({ path: path.join(resultsDir, 'preview-conversation.png') });
  await frame.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'preview-more-menu.png') });
  await frame.getByRole('button', { name: '新对话', exact: true }).press('Escape');
  await frame.getByRole('button', { name: '选择阅读范围', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'preview-scope.png') });
  await page.getByRole('button', { name: '空白', exact: true }).click();
  await frame.locator('#linuxdo-ai-root .message').first().waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '生成中', exact: true }).click();
  await frame.getByRole('button', { name: '停止', exact: true }).waitFor();
  await page.screenshot({ path: path.join(resultsDir, 'preview-loading.png') });
  await frame.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('button', { name: '错误', exact: true }).click();
  await frame.getByText('模型暂时无法连接，请稍后重试。', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(resultsDir, 'preview-error.png') });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await frame.getByLabel('供应商', { exact: true }).waitFor();
  await page.getByRole('button', { name: '窄屏', exact: true }).click();
  await page.screenshot({ path: path.join(resultsDir, 'preview-settings-narrow.png') });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await frame.getByLabel('供应商', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(resultsDir, 'preview-settings-light.png') });
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.locator('.compact-note').isVisible(), true, '窄侧栏仍明确标注模拟数据');
  await frame.getByLabel('模型', { exact: true }).selectOption('custom');
  await frame.getByRole('button', { name: '模型测速', exact: true }).click();
  await frame.locator('.test-result[data-state="complete"]').waitFor();
  await page.screenshot({ path: path.join(resultsDir, 'preview-speed-320.png') });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});

test('统一发送根据输入总结或追问，四档思考可直接选择且回复保留对应模型名', async t => {
  const page = await setup(t);
  await page.getByLabel('API Key', { exact: true }).fill('fixture-deepseek-key');
  await page.getByLabel('模型', { exact: true }).selectOption('custom');
  await page.getByLabel('模型名', { exact: true }).fill('deepseek-custom-model');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(await page.locator('#linuxdo-ai-root .brand strong').innerText(), '话题总结');
  assert.equal(await summary(page).isEnabled(), true);
  assert.equal(await page.locator('#linuxdo-ai-root .composer button[type="submit"]').count(), 1);
  for (const [effort, label] of [['none', '关闭'], ['low', '低'], ['high', '高'], ['max', '最高']]) {
    const before = await page.evaluate(() => fixture.requests.length);
    await page.getByRole('button', { name: '选择思考强度', exact: true }).click();
    assert.equal(await page.getByRole('menuitemradio', { name: label, exact: true }).isVisible(), true);
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    assert.equal(await page.evaluate(() => fixture.requests.length), before, '改变思考档位不会请求模型');
    await summary(page).click(); await done(page);
    const body = await page.evaluate(() => fixture.requests.at(-1).payload);
    assert.equal(body.reasoning_effort, effort);
    assert.equal(body.thinking.type, effort === 'none' ? 'disabled' : 'enabled');
    assert.equal(body.model, 'deepseek-custom-model');
  }
  await input(page).fill('讲讲其中的区别');
  assert.equal(await summary(page).count(), 0);
  await page.getByRole('button', { name: '发送问题', exact: true }).click(); await done(page);
  assert.equal(await page.evaluate(() => fixture.requests.at(-1).payload.messages.at(-1).content), '讲讲其中的区别');
  await openSettings(page);
  assert.equal(await page.getByLabel('供应商', { exact: true }).inputValue(), 'deepseek');
  assert.equal(await page.getByLabel('模型', { exact: true }).inputValue(), 'custom');
  assert.equal(await page.getByLabel('模型名', { exact: true }).inputValue(), 'deepseek-custom-model');
  await page.getByLabel('模型', { exact: true }).selectOption('deepseek-v4-pro');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  assert.deepEqual(await page.locator('#linuxdo-ai-root .assistant .message-head > span').allTextContents(), Array(5).fill('deepseek-custom-model'));
  await page.reload(); await page.locator('#linuxdo-ai-topic-button').click();
  assert.equal(await page.locator('#linuxdo-ai-root .effort-button').innerText(), '思考 · 最高');
  assert.equal(await page.evaluate(() => fixture.requests.length), 0);
});

test('模型测速使用未保存草稿，不读取帖子，并支持停止、关闭及失败后重试', async t => {
  const page = await setup(t, { width: 390, height: 660 });
  await page.getByLabel('API Key', { exact: true }).fill('fixture-only-probe-key');
  await page.getByLabel('模型', { exact: true }).selectOption('custom');
  const modelName = 'deepseek-custom-model-for-speed-test';
  await page.getByLabel('模型名', { exact: true }).fill(modelName);
  await page.getByRole('button', { name: '模型测速', exact: true }).click();
  await page.locator('#linuxdo-ai-root .test-result[data-state="complete"]').waitFor();
  const request = await page.evaluate(() => fixture.requests.at(-1));
  assert.equal(request.payload.model, modelName); assert.equal(request.payload.messages.length, 1);
  assert.equal(request.payload.reasoning_effort, 'none');
  assert.equal(await page.evaluate(() => fixture.calls.length), 0);
  assert.equal(await page.evaluate(() => GM_getValue('linuxdo-ai:v1:config', null)), null, '测速不会保存 API Key 或草稿');
  assert.equal(await page.locator('#linuxdo-ai-root .message').count(), 0);
  assert.match(await page.locator('#linuxdo-ai-root .test-result').innerText(), /token\/秒/);
  await page.screenshot({ path: path.join(resultsDir, 'model-speed-narrow.png') });
  await page.getByLabel('模型名', { exact: true }).fill('deepseek-next');
  assert.equal(await page.locator('#linuxdo-ai-root .test-result').isVisible(), false, '换配置后不显示旧速度');
  await page.evaluate(() => fixture.setMode('slow'));
  await page.getByRole('button', { name: '模型测速', exact: true }).click();
  await page.getByRole('button', { name: '停止测速', exact: true }).click();
  await page.locator('#linuxdo-ai-root .test-result[data-state="stopped"]').waitFor();
  assert.equal(await page.evaluate(() => fixture.requests.at(-1).aborted), true);
  await page.getByRole('button', { name: '模型测速', exact: true }).click();
  await page.getByRole('button', { name: '返回对话', exact: true }).click();
  assert.equal(await page.evaluate(() => fixture.requests.at(-1).aborted), true);
  await openSettings(page);
  await page.getByLabel('API Key', { exact: true }).fill('fixture-only-probe-key');
  await page.evaluate(() => fixture.setMode('api-error'));
  await page.getByRole('button', { name: '模型测速', exact: true }).click();
  await page.locator('#linuxdo-ai-root .test-result[data-state="error"]').waitFor();
  assert.equal(await page.getByRole('button', { name: '模型测速', exact: true }).isEnabled(), true);
  assert.ok(!(await page.locator('#linuxdo-ai-root .test-result').innerText()).includes('fixture-only-probe-key'));
});

test('范围和思考菜单支持键盘选择，在最窄短窗口中保持可见', async t => {
  const page = await setup(t, { width: 320, height: 500 }, { settings: false });
  await page.getByRole('button', { name: '选择阅读范围', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '前 5 帖', exact: true }).press('Home');
  await page.getByRole('menuitemradio', { name: '仅首帖', exact: true }).press('Enter');
  assert.equal(await page.locator('#linuxdo-ai-root .scope-button').innerText(), '仅首帖');
  await input(page).fill(Array(8).fill('长问题输入换行').join('\n'));
  for (const [label, selector] of [['选择阅读范围', '.scope-popover'], ['选择思考强度', '.effort-popover']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const menu = await page.locator(`#linuxdo-ai-root ${selector}`).boundingBox();
    const textbox = await input(page).boundingBox();
    assert.ok(menu.y >= 0 && menu.x >= 0 && menu.x + menu.width <= 320);
    assert.ok(menu.y + menu.height <= textbox.y, '菜单不遮挡输入框');
    await page.screenshot({ path: path.join(resultsDir, selector === '.scope-popover' ? 'scope-menu-320.png' : 'effort-menu-320.png') });
    await page.getByRole('menu', { name: label === '选择阅读范围' ? '阅读范围' : '思考强度', exact: true }).press('Escape');
  }
  assert.equal(await page.locator('#linuxdo-ai-root .panel').evaluate(el => el.scrollWidth > el.clientWidth), false);
  assert.equal(await page.evaluate(() => fixture.calls.length + fixture.requests.length), 0);
});
