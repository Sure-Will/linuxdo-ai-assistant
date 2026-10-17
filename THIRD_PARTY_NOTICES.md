# 第三方组件

- **marked 17.0.5**，MIT License，项目地址：<https://github.com/markedjs/marked>。
  使用本机 Codex 已安装运行库中的固定版本，保留原始 `vendor/marked.esm.js` 和 `vendor/marked-LICENSE.md`。本轮命令行网络不可用，没有将其声明为最新版本。
  仅使用其 Markdown token 解析器，渲染由本项目的 DOM 白名单完成，不使用解析器生成的原始 HTML。
- 浏览器测试使用 **Playwright Core 1.62.1**，不打包进用户脚本。

用户安装文件没有远程 `@require`，不会在每次使用时从 CDN 加载可执行代码。
