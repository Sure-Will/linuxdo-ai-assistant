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
  assert.ok(reading.height > 500, `732px 面板保留足够正文空间，实际 ${reading.height}px`);
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
