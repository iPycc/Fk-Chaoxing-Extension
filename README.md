# Fk-Chaoxing

Chrome 扩展，为超星学习通提供一键复制、字体解密、AI 答题等能力。基于 Manifest V3，全部逻辑在内容脚本中运行，零后端依赖。

---

## 功能一览
- **一键提取**：自动收集主文档 + iframe 中的作业/考试题目，弹窗预览并写入剪贴板
- **AI 答题**：调用外部 API，右下角悬浮面板逐题返回答案
- **解除限制**：破解复制/粘贴禁用、富文本编辑器限制、字体加密混淆
- **极简 UI**：黑白主题 + Google Fonts + RemixIcon，Popup 即用完走

---

## 技术栈
- Manifest V3
- 原生 ES Module（无打包）
- Shadow DOM 隔离样式
- MutationObserver + postMessage 跨 iframe 通信
- Google Fonts / RemixIcon CDN

---

## 架构

```
┌─ background.js          # 生命周期管理
├─ popup/               # 弹窗 UI（极简黑白主题）
│  ├─ popup.html
│  ├─ popup.css
│  └─ popup.js
├─ content-message-handler.js  # 统一消息路由（仅 top 帧响应）
├─ fk-cx-main.js        # 内容脚本入口，按阶段初始化模块
├─ modules/
│  ├─ logger.js         # 全局日志，支持 iframe → top 聚合
│  ├─ ui/               # 可复用组件
│  │  ├─ Modal.js       # 题目预览弹窗（内联样式 + Google Fonts）
│  │  └─ Toast.js       # 轻提示
│  ├─ extractors/       # 策略模式抽取器
│  │  ├─ HomeworkExtractor.js
│  │  └─ ExamExtractor.js
│  ├─ services/       # 业务聚合
│  │  └─ QuestionCollector.js  # 递归收集主文档与 iframe
│  ├─ ai-answer/       # AI 答题子系统
│  │  ├─ index.js     # 初始化（不再注入按钮）
│  │  ├─ core.js      # 题目收集 → AI 调用 → 结果展示
│  │  ├─ ui.js        # 空壳，按钮逻辑已移除
│  │  ├─ notify.js    # 右下角悬浮通知 + 面板
│  │  └─ notify.css   # 面板样式
│  ├─ PasteEnabler.js   # 破解粘贴限制
│  ├─ CopyEnabler.js    # 字体解密 + 复制增强
│  └─ UEditorUnlock.js  # 富文本编辑器解锁
└─ injected.js        # 注入页面上下文，获取 window.UE
```

---

## 核心流程

### 1. 题目提取
- `popup` 发送 `getQuestions` → `content-message-handler`（仅 top 帧响应）
- `QuestionCollector.collectFromDocumentRecursive` 并行扫描主文档与同级 iframe
- 按页面类型选择 `HomeworkExtractor` 或 `ExamExtractor` 策略
- 结果经 `CXModal` 展示，同时写入剪贴板

### 2. AI 答题
- `popup` 发送 `aiAnswer` → `content-message-handler`
- `AIAnswerCore.processAllQuestions()` 复用同一套题目收集逻辑
- 调用外部 AI API，解析返回后通过 `AINotify` 面板逐题展示
- 全程日志通过 `GlobalLogger` 汇总到 top 帧，popup 实时读取

### 3. 跨 iframe 日志聚合
- 每帧维护自己的日志数组
- `postMessage({type:'CX_LOG_SYNC', logs})` 主动推送到 top
- top 帧合并后供 popup 一次性拉取，解决关闭再开日志丢失问题

---

## 更新记录（精简）

- **v1.3.2** 文案与 manifest 中文化
- **v1.3.1** 重构完成
  - 模块化拆分：ui / extractors / services / ai-answer
  - 移除页面固定按钮，全部功能收拢到 popup
  - 统一日志格式与跨帧聚合
  - 黑白极简 UI，Google Fonts + RemixIcon
  - 修复 iframe 重复弹窗 & AI 在考试页面不可用

- **v1.2 及更早** 见 [CHANGELOG.md](CHANGELOG.md)

---

## 本地开发
1. 克隆仓库 → Chrome「加载已解压的扩展」→ 选择根目录
2. 修改任意模块后，点击「重载扩展」按钮即可热更新
3. 控制台过滤 `[Fk-Chaoxing]` 查看结构化日志

---

## 许可证
MIT