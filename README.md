# Fk-Chaoxing 学习通复制粘贴助手-Chrome插件

Chrome 扩展，为超星学习通提供一键复制、字体解密、接入AI模型答题等能力。基于 Manifest V3，全部逻辑在内容脚本中运行，零后端依赖。

好好学习天天向上！！！本插件仅供学习交流，使用者用本插件所产生的一切后果由使用者自行承担，与开发者无关。
## 示例（界面）
![示例](示例.png)
## 功能

- **解除限制**：解除复制/粘贴禁用、富文本编辑器限制、字体加密混淆。
- **AI 自动答题**：支持接入 OpenAI 兼容 API，自动识别并填写超星单选题、多选题、填空题、简答题答案。
- **多模型配置**：支持保存多个 AI 模型，可快速切换并执行连接测试。
- **一键提取**：自动收集作业、考试、章节页面的题目。

## 技术栈

- Manifest V3
- ES Module
- Shadow DOM 隔离样式
- MutationObserver + postMessage 跨 iframe 通信
- Chrome `storage.local` 本地配置持久化
- Chrome `permissions` + `optional_host_permissions` 动态申请 AI 接口域名权限
- OpenAI 兼容 Chat Completions API

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)

## 架构

```
┌─ manifest.json              # 扩展权限、内容脚本与可选 Host 权限声明
├─ background.js              # 后台 Service Worker，处理 AI 请求转发与徽章更新
├─ popup.html                 # 弹窗 UI 结构，包含题目操作与 AI 模型配置弹窗
├─ popup.css                  # 弹窗与配置面板样式
├─ popup.js                   # 弹窗控制器，负责模型配置管理、连接测试与页面交互
├─ content-message-handler.js # 统一消息路由（支持多层 iframe 响应）
├─ content.js                 # 内容脚本入口，支持软关闭检测和延时自动提取重试机制
├─ modules/
│  ├─ logger.js               # 全局日志，支持 iframe → top 聚合
│  ├─ ui/                     # 可复用组件
│  │  ├─ Modal.js             # 极简风格题目预览弹窗
│  │  └─ Toast.js             # 轻提示
│  ├─ extractors/             # 策略模式抽取器
│  │  ├─ HomeworkExtractor.js # 作业/章节 题目提取
│  │  └─ ExamExtractor.js     # 考试/作业作答页 题目提取
│  ├─ services/               # 业务聚合
│  │  └─ QuestionCollector.js  # 递归收集主文档与 iframe
│  ├─ ai-answer/              # AI 答题子系统
│  │  ├─ api.js               # 读取当前激活模型配置，统一封装 API 参数
│  │  ├─ index.js             # 初始化 AI 面板与样式注入
│  │  ├─ core.js              # 题目收集 → AI 调用 → 结果展示
│  │  ├─ ui.js                # 浮动通知面板 UI，支持面板内模型切换
│  │  └─ notify.css           # 面板极简样式
│  ├─ PasteEnabler.js         # 破解粘贴限制
│  ├─ CopyEnabler.js          # 字体解密 + 复制增强
│  └─ UEditorUnlock.js        # 富文本编辑器解锁
└─ injected.js                # 注入页面上下文，获取 window.UE
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
- `modules/ai-answer/api.js` 从本地配置中读取当前激活模型，并统一拼装请求参数。
- `background.js` 负责转发 OpenAI 兼容接口请求，解析返回后通过 `ui.js` 面板逐题展示。
- 全程日志通过 `GlobalLogger` 汇总到 top 帧，popup 实时读取。

### 3. 模型配置

- `popup.js` 维护 `aiProfiles` 与 `activeAiProfileId`，支持多模型新增、删除与切换。
- 保存模型时先校验 `baseUrl`、`apiKey`、`model` 等字段，再动态申请目标域名权限。
- 保存前执行一次最小化连接测试，确认当前模型接口可用后再写入本地存储。
- 页面内答题助手面板可直接切换当前模型，切换结果会同步到后续 AI 答题流程。

### 4. 跨 iframe 日志聚合

- 每帧维护自己的日志数组。
- `postMessage({type:'CX_LOG_SYNC', logs})` 主动推送到 top。
- top 帧合并后供 popup 一次性拉取，解决关闭再开日志丢失问题。

