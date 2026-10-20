import { element, aiIcon, uiIcon, renderMarkdown } from './render.js';

// 版式参照 FluxDO 的 AI 分享图：375px 宽卡片，2 倍像素输出；只提供浅色与深色两种背景。
export const SHARE_THEMES = Object.freeze({
  light: { label: '浅色', bg: '#ffffff', card: '#f5f5f5', fg: '#000000', accent: '#315ca8' },
  dark: { label: '深色', bg: '#1e1e1e', card: '#2d2d2d', fg: '#ffffff', accent: '#8ab4f8' },
});
const WIDTH = 375, SCALE = 2, MAX_CANVAS = 32_000;
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
.share-rule { height: 1px; background: ${mix(10)}; }
.share-messages { padding: 12px 0 16px; }
.share-message + .share-message { margin-top: 12px; }
.share-role { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: ${mix(60)}; }
.share-body { padding: 12px; border-radius: 8px; background: var(--card); overflow-wrap: anywhere; }
.share-body.plain { white-space: pre-wrap; }
.share-body > :first-child { margin-top: 0; }
.share-body > :last-child { margin-bottom: 0; }
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

// messages: [{ role, content, model }]；多条时像 FluxDO 一样标注“提问 / AI 回复”。
export function shareCard({ title, topicId, messages, theme, time }) {
  const colors = SHARE_THEMES[theme] || SHARE_THEMES.light;
  const labeled = messages.length > 1;
  const items = messages.map(message => {
    const user = message.role === 'user';
    const body = user ? element('div', { class: 'share-body plain', text: clean(message.content) })
      : element('div', { class: 'share-body' }, [renderMarkdown(clean(message.content))]);
    const role = labeled ? element('div', { class: 'share-role' }, [user ? uiIcon('user') : aiIcon(),
      element('span', { text: user ? '提问' : `AI 回复${message.model ? ` · ${message.model}` : ''}` })]) : null;
    return element('div', { class: 'share-message' }, role ? [role, body] : [body]);
  });
  return element('div', { class: 'share-card', style: `--bg: ${colors.bg}; --card: ${colors.card}; --fg: ${colors.fg}; --accent: ${colors.accent};` }, [
    element('style', { text: shareStyles }),
    element('div', { class: 'share-head' }, [logo(), element('span', { class: 'share-brand', text: 'LINUX DO' }),
      element('span', { class: 'share-badge' }, [aiIcon(), element('span', { text: 'AI 助手' })])]),
    element('div', { class: 'share-title', text: clean(title) || '当前话题' }),
    element('div', { class: 'share-rule' }),
    element('div', { class: 'share-messages' }, items),
    element('div', { class: 'share-rule' }),
    element('div', { class: 'share-foot' }, [
      element('div', { class: 'share-foot-row' }, [aiIcon(), element('span', { text: '由 Linux.do AI 阅读助手生成' }), element('span', { class: 'share-time', text: time })]),
      element('div', { class: 'share-foot-row' }, [uiIcon('link'), element('span', { class: 'share-link', text: `https://linux.do/t/${topicId}` })]),
    ]),
  ]);
}

// 在隔离的影子根里排版取高度，再经 SVG foreignObject 画到 canvas，不加载任何外部资源。
export async function renderShareImage(card) {
  const stage = document.createElement('div');
  const shadow = stage.attachShadow({ mode: 'open' });
  shadow.append(element('style', { text: ':host { all: initial; position: fixed; left: -10000px; top: 0; pointer-events: none; }' }), card);
  document.body.append(stage);
  try {
    const width = Math.ceil(card.getBoundingClientRect().width), height = Math.ceil(card.getBoundingClientRect().height);
    const scale = Math.min(SCALE, MAX_CANVAS / height);
    if (scale < 1) throw new Error('对话太长，无法生成一张图片。请新建对话后分开导出。');
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
