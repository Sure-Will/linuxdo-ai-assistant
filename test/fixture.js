(() => {
  const params = new URLSearchParams(location.search);
  const isPreview = params.get('preview') === '1';
  const storeKey = isPreview ? 'linuxdo-ai-preview:' : 'linuxdo-ai-fixture:';
  const previewTitle = 'pi 新版本号发生跳跃，似乎是 1.0 的前兆。';
  const previewAnswer = '## 讨论要点\n\n帖子围绕 **pi 版本号的变化** 展开：新版本号出现跳跃，有人据此推测项目正在为 1.0 做准备。\n\n- 发帖者将版本号变化视为可能的发布信号。\n- 回复主要讨论新架构、旧分支，以及升级后的兼容性。\n- 目前的材料以猜测和期待为主，还不足以确定发布时间。\n\n## 可以确认什么\n\n版本号发生了变化，但 **版本号变化与正式发布是两件事**。判断是否进入 1.0，还需要结合项目的发布说明与维护者公告。\n\n> 先看变更日志，再决定是否升级日常环境。\n\n### 如果准备升级\n\n1. 保留现有配置与会话记录。\n2. 在独立环境验证常用功能。\n3. 核对插件与模型配置是否兼容。\n\n这是一段用于检视排版与交互的模拟回答。';
  const calls = [], requests = [];
  let mode = 'normal';
  window.GM_getValue = (key, fallback) => { const value = localStorage.getItem(storeKey + key); return value === null ? fallback : JSON.parse(value); };
  window.GM_setValue = (key, value) => localStorage.setItem(storeKey + key, JSON.stringify(value));
  window.GM_registerMenuCommand = () => {};
  window.GM_addValueChangeListener = () => {};
  if (isPreview) {
    const scene = params.get('scene') || 'conversation';
    const time = Date.now();
    const messages = ['conversation', 'error'].includes(scene) ? [
      { id: 'preview-question', role: 'user', content: '请简要总结这个话题的主要内容和讨论要点。', status: 'complete', createdAt: time },
      { id: 'preview-answer', role: 'assistant', content: scene === 'error' ? '' : previewAnswer, status: scene === 'error' ? 'error' : 'complete', model: 'deepseek-flash', createdAt: time, ...(scene === 'error' ? { error: '模型暂时无法连接，请稍后重试。' } : {}) },
    ] : [];
    GM_setValue('linuxdo-ai:v1:config', { endpoint: 'https://api.deepseek.com/chat/completions', key: 'preview-only-no-network', model: 'deepseek-flash' });
    GM_setValue('linuxdo-ai:v1:topic:1001', { version: 1, title: previewTitle, activeId: 'preview-current', sessions: [
      { id: 'preview-current', createdAt: time, scope: '5', messages },
      { id: 'preview-previous', createdAt: time - 3600000, scope: 'first', messages: [{ id: 'preview-old-question', role: 'user', content: '新架构有哪些变化？', status: 'complete' }, { id: 'preview-old-answer', role: 'assistant', content: '可以先从会话管理和插件兼容性两方面查看变更日志。', status: 'complete', model: 'deepseek-flash' }] },
    ] });
    document.documentElement.classList.toggle('dark', params.get('theme') !== 'light');
    const heading = document.querySelector('#topic-title h1 a'); if (heading) heading.textContent = previewTitle;
  }
  const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  const post = (id, topic) => ({ id, post_number: id, username: `测试_${id}`, cooked: `<p>话题 ${topic} 的测试楼层 ${id}。</p><pre><code>const floor = ${id};</code></pre>` });
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (path, options) => {
    if (typeof path !== 'string' || !path.startsWith('/t/')) return nativeFetch(path, options);
    if (options.signal?.aborted) throw new DOMException('stopped', 'AbortError');
    calls.push(path);
    const url = new URL(path, location.href);
    const topic = url.pathname.split('/')[2].replace('.json', '');
    if (mode === 'forum-error') return new Response('<html>verification</html>', { status: 403 });
    if (url.pathname.endsWith('/posts.json')) {
      const ids = url.searchParams.getAll('post_ids[]').map(Number);
      return json({ post_stream: { posts: (mode === 'missing' ? ids.slice(1) : ids).map(id => post(id, topic)) } });
    }
    return json({ id: Number(topic), title: isPreview ? previewTitle : topic === '1001' ? '长帖阅读验收：47 篇帖子，分批补齐' : '第二个测试话题：上下文必须独立',
      post_stream: { stream: Array.from({ length: 47 }, (_, i) => i + 1), posts: [post(1, topic), post(2, topic)] } });
  };
  const answer = '## 主要内容\n\n这段讨论关注 **长帖的完整读取** 与连续追问。默认只读前 5 帖，选择“全部帖子”后应补齐其余楼层。\n\n- 按所选范围获取帖子，避免漏掉尚未渲染的回复。\n- 话题切换时取消旧请求，保持对话独立。\n- 设置与对话保存在本地。\n\n| 检查项 | 预期 |\n| --- | --- |\n| 分批读取 | 47/47 帖 |\n| 继续追问 | 带入完整历史 |\n\n```js\nconst context = await loadTopic();\n```\n\n可以回看 [第 21 楼](https://linux.do/t/1001/21)。\n';
  window.GM_xmlhttpRequest = options => {
    const request = { url: options.url, payload: JSON.parse(options.data), aborted: false }; requests.push(request);
    let controller, timer;
    const currentMode = mode;
    const response = new ReadableStream({ start(value) { controller = value; }, cancel() { clearTimeout(timer); } });
    const enc = new TextEncoder();
    const send = value => controller.enqueue(enc.encode(`data: ${JSON.stringify(value)}\n\n`));
    timer = setTimeout(() => {
      if (request.aborted) return;
      if (currentMode === 'api-error') { options.onerror(); return; }
      options.onloadstart({ status: 200, response, responseHeaders: 'content-type: text/event-stream' });
      const text = request.payload.max_tokens === 512 ? Array.from({ length: 50 }, (_, i) => i + 1).join(' ') : currentMode === 'xss' ? '# 安全测试\n<script>window.fixtureXss=1</script>\n\n[点击](javascript:alert(1))\n\n![图片](https://example.com/tracker.png)\n\n<img src=x onerror="window.fixtureXss=2">\n\n**正常文字**' : currentMode === 'long' ? Array(15).fill(answer).join('\n\n') : isPreview ? previewAnswer : answer;
      const pieces = text.match(/[\s\S]{1,13}/gu) || []; let index = 0;
      const tick = () => {
        if (request.aborted) return;
        if (index < pieces.length) { send({ choices: [{ delta: { content: pieces[index++] } }] }); timer = setTimeout(tick, currentMode === 'preview-slow' ? 260 : currentMode === 'slow' ? 100 : 8); }
        else { send({ choices: [{ delta: {}, finish_reason: 'stop' }], ...(request.payload.stream_options?.include_usage ? { usage: { completion_tokens: 99 } } : {}) }); controller.enqueue(enc.encode('data: [DONE]\n\n')); }
      };
      tick();
    }, 20);
    return { abort() { request.aborted = true; clearTimeout(timer); options.onabort?.(); } };
  };
  function navigate(id) {
    history.pushState({}, '', `/t/topic/${id}`);
    const heading = document.querySelector('#topic-title h1'); heading.dataset.topicId = id;
    heading.querySelector('a').textContent = id === '1001' ? '长帖阅读验收：47 篇帖子，分批补齐' : '第二个测试话题：上下文必须独立';
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  document.getElementById('go-first').onclick = () => navigate('1001');
  document.getElementById('go-second').onclick = () => navigate('1002');
  document.getElementById('theme-toggle').onclick = () => document.documentElement.classList.toggle('dark');
  window.fixture = { calls, requests, setMode(value) { mode = value; }, storeKey };
})();
