(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('preview') !== '1') return;
  document.querySelector('.fixture-notice').hidden = true;
  document.querySelectorAll('header button').forEach(button => { button.hidden = true; });
  const paragraphs = [
    '看到 pi 的版本号有了明显变化，大家开始讨论是否接近 1.0，以及新的架构会带来什么。',
    '日常使用时，我更关心已有配置、插件和会话能否顺利迁移。有人已经试过新的版本了吗？',
    '从维护者的变更记录判断会更稳妥，版本号本身还不能说明具体的发布时间。',
  ];
  document.querySelectorAll('main article').forEach((article, index) => {
    const author = document.createElement('small'); author.textContent = `${['北窗', '松间', '行舟'][index]} · #${index + 1}`;
    const text = document.createElement('p'); text.textContent = paragraphs[index]; article.replaceChildren(author, text);
  });
  const root = document.querySelector('#linuxdo-ai-root').shadowRoot;
  root.querySelector('.launcher').click();
  const scene = params.get('scene');
  if (scene === 'settings') {
    root.querySelector('[aria-label="更多操作"]').click();
    root.querySelector('[aria-label="模型设置"]').click();
  } else if (scene === 'loading') {
    fixture.setMode('preview-slow');
    root.querySelector('[aria-label="总结这个话题"]').click();
  } else {
    const conversation = root.querySelector('.conversation'); conversation.scrollTop = 0;
    conversation.dispatchEvent(new Event('scroll'));
  }
})();
