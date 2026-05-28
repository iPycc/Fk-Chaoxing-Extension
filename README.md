# Fk-Chaoxing 学习通复制粘贴助手-Chrome插件

Chrome 扩展，为超星学习通提供一键复制、字体解密、接入AI模型答题等能力。基于 Manifest V3，全部逻辑在内容脚本中运行，零后端依赖。

好好学习天天向上！！！本插件仅供学习交流，使用者用本插件所产生的一切后果由使用者自行承担，与开发者无关。

## 功能

- **极简体验**：重构现代极简风格的交互界面（Popup 与模态窗），摒弃冗余的色块与动画，专注阅读体验。
- **一键提取**：自动判断作业、考试、章节等页面，自动收集主文档 + 嵌套 iframe 中的题目。
- **软关闭模式**：支持一键临时关闭插件功能，避免对学习通页面的干扰。
- **解除限制**：破解复制/粘贴禁用、富文本编辑器限制、字体加密混淆。
- **接入AI大模型 答题**：调用外部 API，悬浮面板逐题返回答案，采用极简无 Emoji 风格。

## 技术栈

- Manifest V3
- 原生 ES Module（无打包）
- Shadow DOM 隔离样式
- MutationObserver + postMessage 跨 iframe 通信
- 原生系统字体栈 (System Font Stack)

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)

## 架构

```
┌─ background.js          # 生命周期管理，支持徽章（Badge）更新
├─ popup/               # 弹窗 UI（极简黑白主题 + 开关软关闭控制）
│  ├─ popup.html
│  ├─ popup.css
│  └─ popup.js
├─ content-message-handler.js  # 统一消息路由（支持多层 iframe 响应）
├─ content.js        # 内容脚本入口，支持软关闭检测和延时自动提取重试机制
├─ modules/
│  ├─ logger.js         # 全局日志，支持 iframe → top 聚合
│  ├─ ui/               # 可复用组件
│  │  ├─ Modal.js       # 极简风格题目预览弹窗
│  │  └─ Toast.js       # 轻提示
│  ├─ extractors/       # 策略模式抽取器
│  │  ├─ HomeworkExtractor.js # 作业作答 题目提取
│  │  └─ ExamExtractor.js # 考试 题目提取
│  ├─ services/       # 业务聚合
│  │  └─ QuestionCollector.js  # 递归收集主文档与 iframe
│  ├─ ai-answer/       # AI 答题子系统
│  │  ├─ index.js     # 初始化（不再注入按钮）
│  │  ├─ core.js      # 题目收集 → AI 调用 → 结果展示
│  │  ├─ ui.js        # 浮动通知面板 UI
│  │  └─ notify.css   # 面板极简样式
│  ├─ PasteEnabler.js   # 破解粘贴限制
│  ├─ CopyEnabler.js    # 字体解密 + 复制增强
│  └─ UEditorUnlock.js  # 富文本编辑器解锁
└─ injected.js        # 注入页面上下文，获取 window.UE
```

## 核心流程

### 1. 题目提取

- `popup` 发送 `getQuestions` 或 `content.js` 自动检测页面执行。
- `QuestionCollector.collectFromDocumentRecursive` 并行扫描主文档与同级 iframe。
- 自动重试机制：对于 iframe 异步加载的页面延迟探测，避免获取不到题目。
- 结果经 `CXModal` 展示，同时写入剪贴板，并将数量显示在扩展徽章 (Badge) 上。

### 2. AI 答题

- `popup` 发送 `aiAnswer` → `content-message-handler`。
- `AIAnswerCore.processAllQuestions()` 复用同一套题目收集逻辑。
- 调用外部 AI API，解析返回后通过 `ui.js` 面板逐题展示。
- 全程日志通过 `GlobalLogger` 汇总到 top 帧，popup 实时读取。

### 3. 跨 iframe 日志聚合

- 每帧维护自己的日志数组。
- `postMessage({type:'CX_LOG_SYNC', logs})` 主动推送到 top。
- top 帧合并后供 popup 一次性拉取，解决关闭再开日志丢失问题。

