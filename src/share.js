import { element, aiIcon, uiIcon, renderMarkdown } from './render.js';

// 版式参照 FluxDO 的 AI 分享图：375px 宽卡片，2 倍像素输出；只提供浅色与深色两种背景。
export const SHARE_THEMES = Object.freeze({
  light: { label: '浅色', bg: '#ffffff', card: '#f5f5f5', fg: '#000000', accent: '#315ca8' },
  dark: { label: '深色', bg: '#1e1e1e', card: '#2d2d2d', fg: '#ffffff', accent: '#8ab4f8' },
});
const WIDTH = 375, SCALE = 2, MAX_CANVAS = 32_000;
// 长帖：正文超过约 3.5 屏手机高度时默认只保留开头约 1.8 屏，在附近的段落或图片结尾截断。
export const LONG_POST = 2400;
const BRIEF_POST = 1200, CUT_RANGE = 240;
const mix = percent => `color-mix(in srgb, var(--fg) ${percent}%, transparent)`;
const shareStyles = `
.share-card { width: ${WIDTH}px; padding: 20px; background: var(--bg); color: ${mix(85)}; font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased; }
.share-card, .share-card * { box-sizing: border-box; }
.share-card .ui-icon, .share-card .linuxdo-ai-icon { flex: none; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.share-head { display: flex; align-items: center; gap: 8px; }
.share-logo { flex: none; width: 28px; height: 28px; }
.share-brand { font-size: 16px; font-weight: 600; color: ${mix(80)}; }
.share-badge { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 12px; color: ${mix(50)}; }
.share-title { margin: 16px 0 12px; font-size: 16px; font-weight: 600; line-height: 1.4; color: ${mix(90)}; overflow-wrap: anywhere; }
.share-head + :not(.share-title) { margin-top: 16px; }
.share-card .share-emoji { display: inline; width: 1.25em; height: 1.25em; margin: 0 1px; vertical-align: -0.25em; }
.share-rule { height: 1px; background: ${mix(10)}; }
.share-messages { padding: 12px 0 16px; }
.share-message + .share-message { margin-top: 12px; }
.share-role { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: ${mix(60)}; }
.share-body { padding: 12px; border-radius: 8px; background: var(--card); overflow-wrap: anywhere; }
.share-body.plain { white-space: pre-wrap; }
.share-body > :first-child { margin-top: 0; }
.share-body > :last-child, .share-body :is(blockquote, li, td, th, .share-quote, .share-details) > :last-child { margin-bottom: 0; }
.share-body p { margin: 0 0 10px; }
.share-body h2, .share-body h3, .share-body h4 { margin: 16px 0 8px; font-size: 15px; line-height: 1.5; font-weight: 650; color: ${mix(92)}; }
.share-body ul, .share-body ol { margin: 8px 0 12px; padding-left: 22px; }
.share-body li { margin-bottom: 4px; }
.share-body li p { margin-bottom: 4px; }
.share-body a { color: var(--accent); text-decoration: none; }
.share-body strong { color: ${mix(95)}; }
.share-body code { font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 4px; border-radius: 4px; background: ${mix(7)}; }
.share-body pre { margin: 10px 0; padding: 10px; border-radius: 6px; background: ${mix(7)}; white-space: pre-wrap; }
.share-body pre code { padding: 0; background: transparent; }
.share-body blockquote { margin: 10px 0; padding: 2px 0 2px 10px; border-left: 2px solid ${mix(20)}; color: ${mix(65)}; }
.share-body hr { margin: 14px 0; border: 0; border-top: 1px solid ${mix(12)}; }
.share-body table { width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 12px; }
.share-body th, .share-body td { padding: 5px 6px; border: 1px solid ${mix(14)}; text-align: left; background: transparent; }
.share-body th { background: ${mix(5)}; }
.share-author { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.share-avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; box-shadow: 0 0 0 1px ${mix(10)}; }
.share-avatar.fallback { display: grid; place-items: center; background: ${mix(12)}; color: ${mix(70)}; font-size: 15px; font-weight: 600; }
.share-author-text { flex: 1; min-width: 0; line-height: 1.45; }
.share-floor { flex: none; align-self: flex-start; margin-top: 2px; padding: 1px 6px; border-radius: 4px; background: ${mix(7)}; color: ${mix(60)}; font-size: 11px; font-variant-numeric: tabular-nums; }
.share-name { font-size: 14px; font-weight: 500; color: ${mix(85)}; overflow-wrap: anywhere; }
.share-handle { font-size: 12px; color: ${mix(60)}; overflow-wrap: anywhere; }
.share-post { padding: 12px 0 16px; }
.share-body .share-image { display: block; max-width: 100%; height: auto; margin: 8px 0; border-radius: 6px; }
.share-clip { position: relative; overflow: hidden; border-radius: 8px; }
.share-clip::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 72px; background: linear-gradient(color-mix(in srgb, var(--card) 0%, transparent), var(--card)); }
.share-more { margin-top: 10px; font-size: 12px; text-align: center; color: ${mix(55)}; }
.share-body .share-missing { display: block; margin: 8px 0; padding: 10px; border-radius: 6px; background: ${mix(6)}; color: ${mix(50)}; font-size: 12px; text-align: center; }
.share-body .share-quote { margin: 10px 0; padding: 8px 10px; border-left: 2px solid ${mix(20)}; border-radius: 0 6px 6px 0; background: ${mix(4)}; }
.share-body .share-quote-title { margin-bottom: 4px; font-size: 12px; color: ${mix(60)}; }
.share-body .share-quote blockquote { margin: 0; padding: 0; border: 0; color: inherit; }
.share-body .share-onebox { margin: 10px 0; padding: 8px 10px; border: 1px solid ${mix(12)}; border-radius: 6px; }
.share-body .share-onebox-title { font-weight: 600; color: ${mix(90)}; }
.share-body .share-onebox-text { font-size: 12px; color: ${mix(65)}; }
.share-body .share-onebox-host { font-size: 11px; color: ${mix(50)}; }
.share-body .share-placeholder, .share-body .share-spoiler { padding: 0 4px; border-radius: 4px; background: ${mix(10)}; color: ${mix(55)}; font-size: 12px; }
.share-body .share-details-summary { font-weight: 600; }
.share-foot { padding-top: 12px; font-size: 11px; color: ${mix(60)}; }
.share-foot-row { display: flex; align-items: center; gap: 4px; }
.share-foot-row + .share-foot-row { margin-top: 6px; }
.share-time { margin-left: auto; font-variant-numeric: tabular-nums; }
.share-link { min-width: 0; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const SVG = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
function logo() {
  const svg = svgNode('svg', { viewBox: '0 0 1024 1024', class: 'share-logo', 'aria-hidden': 'true' });
  const clip = svgNode('clipPath', { id: 'share-logo-clip' });
  clip.append(svgNode('circle', { cx: '512', cy: '512', r: '421' }));
  const bands = svgNode('g', { 'clip-path': 'url(#share-logo-clip)' });
  bands.append(svgNode('rect', { x: '91', y: '91', width: '842', height: '233', fill: '#1c1c1e' }),
    svgNode('rect', { x: '91', y: '324', width: '842', height: '376', fill: '#f0f0f0' }),
    svgNode('rect', { x: '91', y: '700', width: '842', height: '233', fill: '#ffb003' }));
  svg.append(svgNode('circle', { cx: '512', cy: '512', r: '448', fill: '#f0f0f0' }), clip, bands);
  return svg;
}
// XML 不允许的控制字符会让整张 SVG 解析失败。
const clean = text => String(text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
const pad = value => String(value).padStart(2, '0');
export function shareTime(value) {
  const date = new Date(Number.isFinite(value) ? value : Date.now());
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// title 可以是文字或已内联 emoji 的节点；取不到标题时不显示这一行，不再写“当前话题”占位。
function frame({ theme, title, badge, middle, foot }) {
  const colors = SHARE_THEMES[theme] || SHARE_THEMES.light;
  const heading = title instanceof Node ? title.cloneNode(true) : clean(title).trim();
  const titled = typeof heading === 'string' ? Boolean(heading) : Boolean(heading.textContent.trim() || heading.querySelector('img'));
  return element('div', { class: 'share-card', style: `--bg: ${colors.bg}; --card: ${colors.card}; --fg: ${colors.fg}; --accent: ${colors.accent};` }, [
    element('style', { text: shareStyles }),
    element('div', { class: 'share-head' }, [logo(), element('span', { class: 'share-brand', text: 'LINUX DO' }), ...(badge ? [badge] : [])]),
    ...(titled ? [element('div', { class: 'share-title' }, [heading])] : []),
    ...middle,
    element('div', { class: 'share-rule' }),
    element('div', { class: 'share-foot' }, foot),
  ]);
}

// messages: [{ role, content, model }]；多条时像 FluxDO 一样标注“提问 / AI 回复”。
export function shareCard({ title, topicId, messages, theme, time }) {
  const labeled = messages.length > 1;
  const items = messages.map(message => {
    const user = message.role === 'user';
    const body = user ? element('div', { class: 'share-body plain', text: clean(message.content) })
      : element('div', { class: 'share-body' }, [renderMarkdown(clean(message.content))]);
    const role = labeled ? element('div', { class: 'share-role' }, [user ? uiIcon('user') : aiIcon(),
      element('span', { text: user ? '提问' : `AI 回复${message.model ? ` · ${message.model}` : ''}` })]) : null;
    return element('div', { class: 'share-message' }, role ? [role, body] : [body]);
  });
  return frame({ theme, title, badge: element('span', { class: 'share-badge' }, [aiIcon(), element('span', { text: 'AI 助手' })]),
    middle: [element('div', { class: 'share-rule' }), element('div', { class: 'share-messages' }, items)],
    foot: [
      element('div', { class: 'share-foot-row' }, [aiIcon(), element('span', { text: '由 Linux.do AI 阅读助手生成' }), element('span', { class: 'share-time', text: time })]),
      element('div', { class: 'share-foot-row' }, [uiIcon('link'), element('span', { class: 'share-link', text: `https://linux.do/t/${topicId}` })]),
    ] });
}

// 帖子正文来自 Discourse 服务端渲染的 cooked HTML：在惰性模板中解析，只按白名单重建节点，不复制任何属性。
const POST_TAGS = { P: 'p', BR: 'br', HR: 'hr', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', DEL: 'del', S: 'del', INS: 'u', U: 'u', SUP: 'sup', SUB: 'sub', MARK: 'mark',
  BLOCKQUOTE: 'blockquote', UL: 'ul', OL: 'ol', LI: 'li', TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'tr', TH: 'th', TD: 'td',
  H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h4', H6: 'h4' };
const PLACEHOLDERS = { VIDEO: '[视频]', AUDIO: '[音频]', IFRAME: '[嵌入内容]' };
const DROPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OBJECT', 'EMBED', 'FORM', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'CANVAS', 'svg']);
const MAX_POST_IMAGES = 12;
const placeholder = text => element('span', { class: 'share-placeholder', text });
function postNodes(node, images) {
  const fragment = document.createDocumentFragment();
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) { fragment.append(document.createTextNode(clean(child.textContent))); continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName, has = name => child.classList.contains(name);
    if (DROPPED.has(tag) || has('meta') || has('anchor') || has('quote-controls')) continue;
    if (PLACEHOLDERS[tag]) fragment.append(placeholder(PLACEHOLDERS[tag]));
    else if (has('video-placeholder-container') || has('lazy-video-container')) fragment.append(placeholder('[视频]'));
    else if (has('poll')) fragment.append(placeholder('[投票]'));
    else if (has('spoiler') || has('spoiled')) fragment.append(element('span', { class: 'share-spoiler', text: '（剧透内容）' }));
    else if (tag === 'IMG') {
      const url = child.getAttribute('src') || '', emoji = has('emoji');
      if (has('avatar') || has('site-icon') || !url) continue;
      const kind = emoji ? 'emoji' : 'image';
      if (kind === 'image' && images.filter(item => item.kind === 'image').length >= MAX_POST_IMAGES) { fragment.append(element('span', { class: 'share-placeholder share-picture', text: '[图片]' })); continue; }
      const image = element('img', { class: emoji ? 'share-emoji' : 'share-image', alt: '' });
      images.push({ node: image, url, kind, alt: clean(child.getAttribute('alt') || child.getAttribute('title') || '') });
      fragment.append(image);
    } else if (tag === 'ASIDE' && has('quote')) {
      const title = child.dataset.username ? `${child.dataset.username}:` : clean(child.querySelector('.title')?.textContent.trim());
      const quote = child.querySelector('blockquote');
      fragment.append(element('div', { class: 'share-quote' }, [element('div', { class: 'share-quote-title', text: title || '引用' }), element('blockquote', {}, [quote ? postNodes(quote, images) : ''])]));
    } else if (has('onebox') && !has('inline-onebox')) {
      const heading = child.querySelector('h3, h4')?.textContent.trim() || child.querySelector('header a, a')?.textContent.trim() || '';
      let host = '';
      try { host = new URL(child.dataset.oneboxSrc || child.querySelector('a[href]')?.getAttribute('href') || '', 'https://linux.do').hostname; } catch { /* 无链接时只显示标题。 */ }
      const text = clean(child.querySelector('p')?.textContent.trim() || '');
      fragment.append(element('div', { class: 'share-onebox' }, [element('div', { class: 'share-onebox-title', text: clean(heading) || host || '链接' }),
        ...(text ? [element('div', { class: 'share-onebox-text', text: text.length > 120 ? `${text.slice(0, 120)}…` : text })] : []),
        ...(host ? [element('div', { class: 'share-onebox-host', text: host })] : [])]));
    } else if (tag === 'PRE') fragment.append(element('pre', {}, [element('code', { text: clean(child.textContent) })]));
    else if (tag === 'CODE' || tag === 'KBD') fragment.append(element('code', { text: clean(child.textContent) }));
    else if (tag === 'A') fragment.append(element('a', {}, [postNodes(child, images)]));
    else if (tag === 'DETAILS') {
      const summary = child.querySelector(':scope > summary');
      const rest = document.createDocumentFragment();
      for (const part of child.childNodes) if (part !== summary) rest.append(part.cloneNode(true));
      fragment.append(element('div', { class: 'share-details' }, [element('p', { class: 'share-details-summary', text: clean(summary?.textContent.trim() || '详情') }), postNodes(rest, images)]));
    } else if (POST_TAGS[tag]) fragment.append(element(POST_TAGS[tag], {}, [postNodes(child, images)]));
    else fragment.append(postNodes(child, images));
  }
  return fragment;
}

// 图片按卡片宽度的 2 倍缩放后转成 data URL；PNG、GIF、WebP 保留透明，其余用 JPEG 控制体积。
async function inlineImage(blob, maxWidth) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const alpha = /png|gif|webp/i.test(blob.type);
    return { src: canvas.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.88), width, height };
  } finally { bitmap.close(); }
}
async function pool(tasks, size) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => { while (next < tasks.length) await tasks[next++](); }));
}

const parse = html => { const template = document.createElement('template'); template.innerHTML = String(html || ''); return template.content; };
// post 为 /posts/{id}.json；fetchImage(url) 返回图片 Blob。加载失败的图片换成占位，不影响导出。
// 该接口默认不带话题标题：title 传页面已知的标题，titleHtml 传页面标题的 HTML，其中的 emoji 与正文一起下载画进图里。
export async function preparePost(post, { fetchImage, onProgress = () => {}, title = '', titleHtml = '' }) {
  const images = [];
  const heading = titleHtml ? element('span', {}, [postNodes(parse(titleHtml), images)]) : null;
  const body = element('div', { class: 'share-body' }, [postNodes(parse(post.cooked), images)]);
  const emoji = new Map();
  let avatar = null, loaded = 0;
  const avatarUrl = typeof post.avatar_template === 'string' ? post.avatar_template.replace('{size}', '96') : '';
  const load = (url, maxWidth) => {
    const target = new URL(url, location.href);
    if (!['https:', 'http:'].includes(target.protocol)) throw new Error('unsupported image');
    return fetchImage(target.href).then(blob => inlineImage(blob, maxWidth));
  };
  const step = async job => {
    try { await job(); } catch (error) { if (error?.name === 'AbortError') throw error; }
    onProgress(++loaded, images.length + (avatarUrl ? 1 : 0));
  };
  const tasks = images.map(item => () => step(async () => {
    try {
      const promise = item.kind === 'emoji' ? (emoji.get(item.url) || emoji.set(item.url, load(item.url, 40)).get(item.url)) : load(item.url, 640);
      const { src, width, height } = await promise;
      item.node.setAttribute('src', src); item.node.setAttribute('width', String(width)); item.node.setAttribute('height', String(height));
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      item.node.replaceWith(item.kind === 'emoji' ? document.createTextNode(item.alt) : element('span', { class: 'share-missing', text: '[图片加载失败]' }));
    }
  }));
  if (avatarUrl) tasks.push(() => step(async () => { avatar = await load(avatarUrl, 72); }));
  await pool(tasks, 4);
  const text = clean(post.topic_title || title).trim();
  return { title: heading && (heading.textContent.trim() || heading.querySelector('img')) ? heading : text, topicId: post.topic_id, slug: post.topic_slug, postNumber: post.post_number,
    name: post.name, username: post.username, createdAt: Date.parse(post.created_at), avatar, body };
}

// brief 来自 measurePost：只画开头 cut 像素的正文，底部渐隐并注明全文篇幅；版式参照 FluxDO，楼层号放在作者行右侧。
export function postCard(post, theme, brief = null) {
  const shown = clean(post.name || post.username || '匿名');
  const avatar = post.avatar ? element('img', { class: 'share-avatar', alt: '', src: post.avatar.src, width: '36', height: '36' })
    : element('div', { class: 'share-avatar fallback', text: Array.from(shown)[0]?.toUpperCase() || '?' });
  const number = Number(post.postNumber) || 1;
  const link = `https://linux.do/t/${encodeURIComponent(post.slug || 'topic')}/${post.topicId}/${number}`;
  const body = post.body.cloneNode(true);
  return frame({ theme, title: post.title,
    middle: [
      element('div', { class: 'share-author' }, [avatar, element('div', { class: 'share-author-text' }, [
        element('div', { class: 'share-name', text: shown }),
        element('div', { class: 'share-handle', text: `@${clean(post.username || '匿名')} · ${shareTime(post.createdAt)}` }),
      ]), element('span', { class: 'share-floor', text: number === 1 ? '#1 楼主' : `#${number}` })]),
      element('div', { class: 'share-rule' }),
      element('div', { class: 'share-post' }, brief ? [element('div', { class: 'share-clip', style: `height: ${brief.cut}px` }, [body]), element('div', { class: 'share-more', text: brief.note })] : [body]),
    ],
    foot: [element('div', { class: 'share-foot-row' }, [uiIcon('link'), element('span', { class: 'share-link', text: link })])] });
}

// 在隔离的影子根里排版，不加载任何外部资源。
function mount(card) {
  const stage = document.createElement('div');
  stage.attachShadow({ mode: 'open' }).append(element('style', { text: ':host { all: initial; position: fixed; left: -10000px; top: 0; pointer-events: none; }' }), card);
  document.body.append(stage);
  return stage;
}

// 正文不超过 LONG_POST 时返回 null。超过时在 BRIEF_POST 附近找最近的元素底边截断，
// 落在段落、图片或一行的结尾，避免切在图片中间；附近没有合适位置才按固定高度截。
export function measurePost(post) {
  const card = postCard(post, 'light'), stage = mount(card);
  try {
    const body = card.querySelector('.share-post > .share-body'), box = body.getBoundingClientRect();
    if (box.height <= LONG_POST) return null;
    const ends = [...body.querySelectorAll('*')].map(node => Math.ceil(node.getBoundingClientRect().bottom - box.top))
      .filter(end => Math.abs(end - BRIEF_POST) <= CUT_RANGE).sort((a, b) => Math.abs(a - BRIEF_POST) - Math.abs(b - BRIEF_POST));
    const chars = body.textContent.replace(/\s+/g, '').length;
    const pictures = body.querySelectorAll('.share-image, .share-missing, .share-picture').length;
    return { cut: ends[0] ?? BRIEF_POST, height: Math.ceil(box.height),
      note: `仅展示开头 · 全文约 ${chars.toLocaleString('zh-CN')} 字${pictures ? `、${pictures} 张图` : ''}` };
  } finally { stage.remove(); }
}

// 经 SVG foreignObject 画到 canvas。超出单张画布上限时抛出 code 为 too-tall 的错误，由调用方给出提示。
export async function renderShareImage(card) {
  const stage = mount(card);
  try {
    const width = Math.ceil(card.getBoundingClientRect().width), height = Math.ceil(card.getBoundingClientRect().height);
    const scale = Math.min(SCALE, MAX_CANVAS / height);
    if (scale < 1) throw Object.assign(new Error('内容太长，无法生成一张图片。'), { code: 'too-tall' });
    const markup = new XMLSerializer().serializeToString(card);
    const svg = `<svg xmlns="${SVG}" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    try { await image.decode(); } catch { throw new Error('图片生成失败，当前页面可能限制了图片绘制。'); }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.scale(scale, scale); context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片生成失败，请重试。');
    return { canvas, blob };
  } finally { stage.remove(); }
}
