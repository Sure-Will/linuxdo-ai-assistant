import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { topicIdFromUrl, normalizeEndpoint, validateConfig, wantedPostIds, collectTopic, EventStreamParser, buildMessages, streamChat } from '../src/core.js';

test('识别 slug、纯数字话题地址与楼层地址', () => {
  for (const url of ['/t/topic/123/45', '/t/123/45', '/t/123', '/t/中文/123?x=1']) assert.equal(topicIdFromUrl(url), '123');
  for (const url of ['/latest', '/t/new', '/t/topic/not-a-number']) assert.equal(topicIdFromUrl(url), null);
});
test('规范化 API 地址且拒绝混入凭据和不安全地址', () => {
  assert.equal(normalizeEndpoint(' https://api.deepseek.com/v1/ '), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(normalizeEndpoint('https://api.example.com/chat/completions'), 'https://api.example.com/chat/completions');
  assert.equal(normalizeEndpoint('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1/chat/completions');
  for (const value of ['javascript:alert(1)', 'http://remote.test/v1', 'https://user:pass@api.test', 'https://api.test?key=secret']) assert.throws(() => normalizeEndpoint(value));
  assert.throws(() => validateConfig({ endpoint: 'https://api.test', key: 'a\nb', model: 'm' }));
});
test('上下文默认计数包含首帖，去重后再截取', () => {
  assert.deepEqual(wantedPostIds([1, 1, 2, 3, 4, 5, 6], '5'), [1, 2, 3, 4, 5]);
  assert.deepEqual(wantedPostIds([1, 2], 'first'), [1]);
  assert.throws(() => wantedPostIds([], 'all'));
});
const post = id => ({ id, post_number: id, username: `u${id}`, cooked: `内容 ${id}` });
test('长帖按 20 个补齐，排除接口夹带的其他帖子并保持楼层顺序', async () => {
  const calls = [], progress = [];
  const context = await collectTopic({ topicId: '77', scope: 'all', toText: x => x, onProgress: (...v) => progress.push(v), getJson: async path => {
    calls.push(path);
    if (path === '/t/77.json') return { id: 77, title: '长帖', post_stream: { stream: Array.from({ length: 47 }, (_, i) => i + 1), posts: [post(3), post(2), post(1)] } };
    const ids = new URL(path, 'https://linux.do').searchParams.getAll('post_ids[]').map(Number);
    assert.ok(ids.length <= 20);
    return { post_stream: { posts: [...ids.reverse().map(post), post(999)] } };
  } });
  assert.equal(context.count, 47); assert.equal(calls.length, 4); assert.match(context.text, /^#1 @u1/);
  assert.ok(context.text.indexOf('#20 @') < context.text.indexOf('#21 @')); assert.ok(!context.text.includes('#999'));
  assert.deepEqual(progress.at(-1), [47, 47]);
});
test('缺少楼层时不产生可发送的上下文', async () => {
  await assert.rejects(collectTopic({ topicId: '9', scope: '5', toText: x => x, getJson: async path => path === '/t/9.json'
    ? { id: 9, post_stream: { stream: [1, 2], posts: [post(1)] } } : { post_stream: { posts: [] } } }), /只读到 1\/2/);
});
test('取消上下文加载后不继续请求下一批', async () => {
  const controller = new AbortController(); let count = 0;
  await assert.rejects(collectTopic({ topicId: '9', scope: 'all', signal: controller.signal, toText: x => x, getJson: async () => {
    count++; controller.abort(); return { id: 9, post_stream: { stream: [1], posts: [post(1)] } };
  } }), { name: 'AbortError' }); assert.equal(count, 1);
});
test('SSE 处理 CRLF 拆包、注释、多行 data 和末尾无空行', () => {
  const events = []; const parser = new EventStreamParser(value => events.push(value));
  for (const char of ': keepalive\r\ndata: a\r\ndata: b\r\n\r\nevent: error\ndata: c') parser.push(char);
  parser.push('', true);
  assert.deepEqual(events, [{ event: '', data: 'a\nb' }, { event: 'error', data: 'c' }]);
});
test('追问只带完整问答，保留材料计数和当前问题', () => {
  const context = { topicId: '8', title: '标题', text: '帖子原文', count: 1, total: 12 };
  const messages = buildMessages(context, [
    { role: 'user', content: '问题1' }, { role: 'assistant', content: '答案1', status: 'complete' },
    { role: 'user', content: '问题2' }, { role: 'assistant', content: '半截', status: 'stopped' },
  ], '继续解释');
  assert.match(messages[1].content, /1\/12/); assert.deepEqual(messages.slice(3).map(m => m.content), ['问题1', '答案1', '继续解释']);
});
const config = { endpoint: 'https://model.test/v1/chat/completions', key: 'fake-test-key', model: 'test-model' };
function mockRequest(text, { status = 200, type = 'text/event-stream', delay = 0, split = 1 } = {}) {
  let aborted = false;
  const request = options => {
    assert.equal(options.anonymous, true); assert.equal(options.responseType, 'stream');
    assert.equal(JSON.parse(options.data).stream, true);
    const bytes = new TextEncoder().encode(text); let offset = 0;
    const response = new ReadableStream({ async pull(controller) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (aborted) { controller.close(); return; }
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(offset, offset + split)); offset += split;
    } });
    queueMicrotask(() => options.onloadstart({ status, response, responseHeaders: `content-type: ${type}` }));
    return { abort() { aborted = true; } };
  };
  return { request, get aborted() { return aborted; } };
}
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
test('中文 UTF-8 按单字节拆分后流式正文仍完整', async () => {
  const text = event({ choices: [{ delta: { reasoning_content: '思考' } }] }) + event({ choices: [{ delta: { content: '中文🙂总结' } }] }) + event({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\r\n\r\n';
  let reasoning = false, output = '';
  const result = await streamChat({ config, messages: [], ...mockRequest(text), onReasoning: () => { reasoning = true; }, onDelta: delta => { output += delta; } });
  assert.equal(result, '中文🙂总结'); assert.equal(output, result); assert.equal(reasoning, true);
});
test('服务端提前断流不会伪装成完整答案', async () => {
  await assert.rejects(streamChat({ config, messages: [], ...mockRequest(event({ choices: [{ delta: { content: '半段' } }] })) }), /连接提前结束/);
});
test('HTTP 401 与额度错误给出可行动提示', async () => {
  await assert.rejects(streamChat({ config, messages: [], ...mockRequest('{"error":{"message":"bad key"}}', { status: 401, type: 'application/json' }) }), /API Key 无效/);
});
test('支持服务商忽略 stream 后返回普通 JSON', async () => {
  const data = JSON.stringify({ choices: [{ message: { content: '普通回复' }, finish_reason: 'stop' }] });
  assert.equal(await streamChat({ config, messages: [], ...mockRequest(data, { type: 'application/json' }) }), '普通回复');
});
test('输出上限与内容拦截不标记成功', async () => {
  const text = event({ choices: [{ delta: { content: '部分内容' }, finish_reason: 'length' }] }) + 'data: [DONE]\n\n';
  await assert.rejects(streamChat({ config, messages: [], ...mockRequest(text) }), /输出长度上限/);
});
test('中途取消会终止底层请求且不会继续写入正文', async () => {
  const controller = new AbortController(); const mock = mockRequest(event({ choices: [{ delta: { content: '正文' } }] }), { delay: 4 });
  const promise = streamChat({ config, messages: [], request: mock.request, signal: controller.signal });
  setTimeout(() => controller.abort(), 12);
  await assert.rejects(promise, { name: 'AbortError' }); assert.equal(mock.aborted, true);
});
test('空闲超时只结束一次且不重试请求', async () => {
  let calls = 0, aborted = false;
  await assert.rejects(streamChat({ config, messages: [], idleMs: 8, request() { calls++; return { abort() { aborted = true; } }; } }), /长时间/);
  assert.equal(calls, 1); assert.equal(aborted, true);
});

test('失败后的迟到回调不会重新启动计时器或消费响应', async () => {
  let callbacks, reads = 0, aborts = 0;
  const pending = streamChat({ config, messages: [], idleMs: 10, request(options) { callbacks = options; return { abort() { aborts++; } }; } });
  callbacks.onerror();
  await assert.rejects(pending, /模型连接失败/);
  callbacks.onloadstart({ response: { getReader() { reads++; return {}; } } });
  await new Promise(resolve => setTimeout(resolve, 18));
  assert.equal(reads, 0); assert.equal(aborts, 0);
});

test('油猴拒绝目标域名时显示权限原因，不误报为通用网络故障', async () => {
  let calls = 0;
  await assert.rejects(streamChat({ config, messages: [], request(options) {
    calls++;
    queueMicrotask(() => options.onerror({ status: 0, error: 'Request was blocked by the user' }));
    return { abort() {} };
  } }), /油猴未允许连接 model\.test/);
  assert.equal(calls, 1, '权限拒绝不自动重试');
});

test('油猴同步拒绝请求时也保留域名权限语义，不显示原始敏感信息', async () => {
  await assert.rejects(streamChat({ config, messages: [], request() {
    throw new Error(`Request was blocked by the user; Authorization: Bearer ${config.key}`);
  } }), error => /油猴未允许连接 model\.test/.test(error.message) && !error.message.includes(config.key));
});

test('DeepSeek 的四档思考参数进入真实请求，通用接口默认不附加参数', async () => {
  for (const effort of ['none', 'low', 'high', 'max']) {
    let payload;
    const deepseek = validateConfig({ ...config, endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', effort });
    await streamChat({ config: deepseek, messages: [], request(options) {
      payload = JSON.parse(options.data);
      return mockRequest(event({ choices: [{ delta: { content: '完成' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n').request(options);
    } });
    assert.equal(payload.reasoning_effort, effort);
    assert.deepEqual(payload.thinking, { type: effort === 'none' ? 'disabled' : 'enabled' });
  }
  assert.equal(validateConfig({ ...config, endpoint: 'https://api.deepseek.com' }).effort, 'high');
  let payload;
  await streamChat({ config: validateConfig(config), messages: [], request(options) {
    payload = JSON.parse(options.data);
    return mockRequest(event({ choices: [{ delta: { content: '完成' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n').request(options);
  } });
  assert.ok(!Object.hasOwn(payload, 'reasoning_effort'));
  assert.ok(!Object.hasOwn(payload, 'thinking'));
});

test('测速使用独立短提示、关闭 DeepSeek 思考并从服务端用量计算速率', async () => {
  const { measureModel } = await import('../src/core.js');
  let payload;
  const times = [1000, 1200, 1700];
  const wire = event({ choices: [{ delta: { content: '1 2 ' } }] })
    + event({ choices: [{ delta: { content: '3 4' }, finish_reason: 'stop' }] })
    + event({ choices: [], usage: { completion_tokens: 12 } }) + 'data: [DONE]\n\n';
  const result = await measureModel({ config: { ...config, endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', effort: 'max' }, now: () => times.shift(), request(options) {
    payload = JSON.parse(options.data); return mockRequest(wire).request(options);
  } });
  assert.equal(payload.messages.length, 1);
  assert.ok(!JSON.stringify(payload).includes('forum_material'));
  assert.equal(payload.reasoning_effort, 'none'); assert.equal(payload.max_tokens, 512);
  assert.equal(payload.stream_options.include_usage, true);
  assert.deepEqual(result, { firstMs: 200, totalMs: 700, rate: 24, unit: 'token/秒', tokens: 12 });
});

test('测速没有 token 用量时明确用字符计速，不估算 token', async () => {
  const { measureModel } = await import('../src/core.js');
  const times = [0, 200, 700];
  const wire = event({ choices: [{ delta: { content: '中文' } }] }) + event({ choices: [{ delta: { content: '🙂字' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
  const result = await measureModel({ config, now: () => times.shift(), ...mockRequest(wire) });
  assert.equal(result.rate, 8); assert.equal(result.unit, '字符/秒'); assert.equal(result.tokens, null);
});

test('测速遇到一次性 JSON 不伪造流式生成速度', async () => {
  const { measureModel } = await import('../src/core.js');
  const times = [0, 200, 200];
  const wire = JSON.stringify({ choices: [{ message: { content: '1 2 3' }, finish_reason: 'stop' }], usage: { completion_tokens: 5 } });
  const result = await measureModel({ config, now: () => times.shift(), ...mockRequest(wire, { type: 'application/json' }) });
  assert.equal(result.firstMs, 200); assert.equal(result.rate, null); assert.equal(result.tokens, 5);
});

test('安装文件的版本号与 package.json 一致，并从 main 分支自动更新', async () => {
  const read = name => fs.readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  const pkg = JSON.parse(await read('package.json'));
  const header = (await read('dist/linuxdo-ai.user.js')).split('// ==/UserScript==')[0];
  const field = name => header.match(new RegExp(`^// @${name}\\s+(.+)$`, 'm'))?.[1].trim();
  assert.equal(field('version'), pkg.version, '构建文件已过期，请先运行 npm run build');
  const raw = 'https://raw.githubusercontent.com/Sure-Will/linuxdo-ai-assistant/main/dist/linuxdo-ai.user.js';
  assert.equal(field('updateURL'), raw);
  assert.equal(field('downloadURL'), raw);
});
