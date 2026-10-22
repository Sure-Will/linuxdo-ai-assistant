(() => {
  const params = new URLSearchParams(location.search);
  const isPreview = params.get('preview') === '1';
  const storeKey = isPreview ? 'linuxdo-ai-preview:' : 'linuxdo-ai-fixture:';
  const previewTitle = 'pi 新版本号发生跳跃，似乎是 1.0 的前兆。';
  const previewAnswer = '## 讨论要点\n\n帖子围绕 **pi 版本号的变化** 展开：新版本号出现跳跃，有人据此推测项目正在为 1.0 做准备。\n\n- 发帖者将版本号变化视为可能的发布信号。\n- 回复主要讨论新架构、旧分支，以及升级后的兼容性。\n- 目前的材料以猜测和期待为主，还不足以确定发布时间。\n\n## 可以确认什么\n\n版本号发生了变化，但 **版本号变化与正式发布是两件事**。判断是否进入 1.0，还需要结合项目的发布说明与维护者公告。\n\n> 先看变更日志，再决定是否升级日常环境。\n\n### 如果准备升级\n\n1. 保留现有配置与会话记录。\n2. 在独立环境验证常用功能。\n3. 核对插件与模型配置是否兼容。\n\n这是一段用于检视排版与交互的模拟回答。';
  const reasoningText = '用户想了解回复里大家的看法。先按楼层梳理：首帖把版本号跳跃当作 1.0 的信号；\n第 2 楼更关心配置、插件和会话能否迁移；\n第 3 楼认为应以维护者的变更记录为准。\n这些都是推测和关切，需要和已确认的事实分开说明。';
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
      { id: 'preview-answer', role: 'assistant', content: scene === 'error' ? '' : previewAnswer, status: scene === 'error' ? 'error' : 'complete', model: 'deepseek-flash', createdAt: time, ...(scene === 'error' ? {} : { reasoning: reasoningText, reasoningMs: 6400 }), ...(scene === 'error' ? { error: '模型暂时无法连接，请稍后重试。' } : {}) },
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
  // 生成本地测试图片：截图、emoji 与头像，不访问外部网络。
  const imageBlob = (width, height, color, label) => new Promise(resolve => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffffff'; context.font = `${Math.round(height / 5)}px sans-serif`; context.fillText(label, width * 0.08, height * 0.6);
    canvas.toBlob(resolve, 'image/png');
  });
  const imageFor = url => /emoji/.test(url) ? imageBlob(72, 72, '#f5b400', '☺') : /avatar/.test(url) ? imageBlob(96, 96, '#4a7bd0', '测') : imageBlob(800, 450, '#2f6f5e', '测试截图 14K tps');
  const imageRequests = [];
  const postCooked = topic => `<p>楼主的推理框架数据很详细 <img src="/fixture-image/emoji/smile.png" class="emoji" alt=":smile:" title=":smile:"> 值得一看。</p>
<aside class="quote no-group" data-username="测试楼主" data-post="1" data-topic="${topic}"><div class="title"><div class="quote-controls"></div><img class="avatar" src="/fixture-image/avatar/20.png"> 测试楼主:</div><blockquote><p>每卡吞吐 14K tps。</p></blockquote></aside>
<div class="lightbox-wrapper"><a class="lightbox" href="https://cdn.example.test/original/table.png"><img src="https://cdn.example.test/optimized/table.png" width="690" height="388"><div class="meta"><span class="filename">table.png</span><span class="informations">800×450 120 KB</span></div></a></div>
<p><img src="https://cdn.example.test/broken.png" width="100" height="100"></p>
<aside class="onebox allowlistedgeneric" data-onebox-src="https://github.com/deepseek-ai/example"><header class="source"><a href="https://github.com/deepseek-ai/example">github.com</a></header><article class="onebox-body"><h3><a href="https://github.com/deepseek-ai/example">deepseek-ai/example</a></h3><p>推理框架示例仓库</p></article></aside>
<pre><code class="lang-js"><span class="hljs-keyword">const</span> tps = 14000;</code></pre>
<table><thead><tr><th>指标</th><th>数值</th></tr></thead><tbody><tr><td>吐字速度</td><td>230 tps</td></tr></tbody></table>
<p><span class="spoiler">隐藏内容</span> <a class="mention" href="/u/test">@test</a></p>
<script>window.fixturePostXss = 1</script><img src="javascript:window.fixturePostXss=3" onerror="window.fixturePostXss = 2"><iframe src="https://example.com"></iframe>`;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (path, options) => {
    const href = typeof path === 'string' ? path : path instanceof URL ? path.href : '';
    if (href.includes('/fixture-image/')) { imageRequests.push(href); return new Response(await imageFor(href), { headers: { 'Content-Type': 'image/png' } }); }
    if (href.startsWith('https://cdn.example.test/')) { imageRequests.push(href); throw new TypeError('Failed to fetch'); }
    if (typeof path === 'string' && path.startsWith('/posts/')) {
      calls.push(path);
      if (mode === 'forum-error') return new Response('<html>verification</html>', { status: 403 });
      const id = Number(path.match(/\/posts\/(\d+)\.json/)?.[1]);
      const topic = location.pathname.split('/')[3] || '1001';
      return json({ id, post_number: id > 100 ? id - 96 : id, topic_id: Number(topic), topic_slug: 'topic', topic_title: isPreview ? previewTitle : '长帖阅读验收：47 篇帖子，分批补齐',
        username: `测试_${id}`, name: id === 1 ? '测试楼主' : '测试回复者', avatar_template: '/fixture-image/avatar/{size}.png', created_at: '2026-10-20T07:30:00.000Z',
        cooked: id === 2 ? postCooked(topic) : post(id, topic).cooked });
    }
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
    if (options.method === 'GET') {
      imageRequests.push(options.url);
      const timer = setTimeout(async () => {
        if (/broken/.test(options.url)) options.onload({ status: 404, response: null, responseHeaders: '' });
        else options.onload({ status: 200, response: await imageFor(options.url), responseHeaders: 'content-type: image/png' });
      }, 10);
      return { abort() { clearTimeout(timer); options.onabort?.(); } };
    }
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
      // 开启思考时先发 reasoning_content，再发正文。
      const thinking = request.payload.thinking?.type === 'enabled' || currentMode === 'thinking';
      const pieces = [...(thinking ? (reasoningText.match(/[\s\S]{1,8}/gu) || []).map(reasoning_content => ({ reasoning_content })) : []),
        ...(text.match(/[\s\S]{1,13}/gu) || []).map(content => ({ content }))];
      let index = 0;
      const tick = () => {
        if (request.aborted) return;
        if (index < pieces.length) { send({ choices: [{ delta: pieces[index++] }] }); timer = setTimeout(tick, currentMode === 'preview-slow' ? 260 : currentMode === 'slow' ? 100 : currentMode === 'thinking' ? 40 : 8); }
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
  // 模拟 Discourse 帖子操作栏：收起时只渲染常用按钮，点“…”后才渲染隐藏按钮。
  let menuClicks = 0;
  const actionClicks = [], menuStates = new WeakMap();
  const menuIcons = { like: 'M12 20 3 11a5 5 0 0 1 9-6 5 5 0 0 1 9 6Z', 'copy-link': 'm9 15 6-6m-7 3-3 3a4 4 0 0 0 6 6l3-3m-1-6 3-3a4 4 0 0 0-6-6L7 6', bookmark: 'M6 3h12v18l-6-4-6 4Z', flag: 'M5 22V3h14l-3 4 3 4H5', edit: 'm4 17 12-12 3 3L7 20H4Z', delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15', reply: 'm9 5-6 6 6 6v-5c6 0 9 2 12 6-1-8-5-11-12-11Z', 'show-more': 'M5 12h.01M12 12h.01M19 12h.01' };
  function menuButton(name, label, state) {
    const node = document.createElement('button'); node.type = 'button'; node.className = `btn btn-flat post-action-menu__${name}`;
    node.setAttribute('aria-label', label); node.title = label;
    node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${menuIcons[name]}"></path></svg>`;
    if (name === 'reply') { const text = document.createElement('span'); text.className = 'd-button-label'; text.textContent = label; node.append(text); }
    if (name === 'like' || name === 'bookmark') {
      node.setAttribute('aria-pressed', String(state[name])); node.classList.toggle('active', state[name]);
    }
    if (name !== 'show-more') node.addEventListener('click', () => {
      actionClicks.push(name);
      if (name === 'like' || name === 'bookmark') {
        state[name] = !state[name]; node.setAttribute('aria-pressed', String(state[name])); node.classList.toggle('active', state[name]);
      }
      if (name === 'copy-link') requestAnimationFrame(() => { window.fixture.actionAnchor = node.getBoundingClientRect().toJSON(); });
    });
    return node;
  }
  function renderPostMenu(nav) {
    const state = menuStates.get(nav), actions = nav.querySelector('.actions');
    const reaction = document.createElement('div'); reaction.className = 'discourse-reactions-actions-button-shim';
    reaction.append(menuButton('like', '点赞', state));
    const buttons = [reaction, menuButton('copy-link', '复制链接', state)];
    if (state.expanded) {
      buttons.push(menuButton('bookmark', '收藏', state), menuButton('flag', '举报', state), menuButton('edit', '编辑', state), menuButton('delete', '删除', state));
    } else {
      const more = menuButton('show-more', '显示更多', state); more.classList.add('show-more-actions');
      more.addEventListener('click', () => { menuClicks++; state.expanded = true; renderPostMenu(nav); }); buttons.push(more);
    }
    buttons.push(menuButton('reply', '回复', state));
    nav.className = `post-controls ${state.expanded ? 'expanded' : 'collapsed'}`; actions.replaceChildren(...buttons);
  }
  const postMenu = () => {
    const nav = document.createElement('nav'); nav.className = 'post-controls collapsed';
    const actions = document.createElement('div'); actions.className = 'actions';
    nav.append(actions); menuStates.set(nav, { expanded: false, like: false, bookmark: false }); renderPostMenu(nav);
    return nav;
  };
  document.querySelectorAll('main article').forEach((article, index) => { article.dataset.postId = String(index + 1); article.append(postMenu()); });
  let added = 100;
  function addPost() { const article = document.createElement('article'); article.dataset.postId = String(++added); article.append(postMenu()); document.querySelector('main').append(article); }
  // 模拟 Glimmer 重绘：整组按钮被替换，脚本插入的按钮随之消失。
  function rerenderMenu(index) {
    renderPostMenu(document.querySelectorAll('main nav.post-controls')[index]);
  }
  window.fixture = { calls, requests, imageRequests, actionClicks, setMode(value) { mode = value; }, storeKey, addPost, rerenderMenu, get menuClicks() { return menuClicks; } };
})();
