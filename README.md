# Chaoxing Copy & Paste Helper

## 📋 项目简介

Chaoxing Copy & Paste Helper 是一个专为超星学习通（Chaoxing）平台设计的 Chrome 浏览器扩展。它旨在通过技术手段解除页面上的交互限制，提供便捷的题目提取和 AI 辅助答题功能，从而提升学习效率。

本项目基于 Chrome Extension Manifest V3 规范开发，采用原生 JavaScript (ES6+) 实现，无外部框架依赖，确保轻量级和高性能。

## 🛠️ 核心功能与技术实现

### 1. 解除页面交互限制
- **事件拦截与移除**：通过在 `document_start` 阶段注入 Content Script，利用 Event Capture 机制拦截并阻止 `paste`, `copy`, `cut`, `contextmenu`, `selectstart` 等事件的默认行为和冒泡，从而解除网页对复制、粘贴和右键菜单的封锁。
- **CSS 注入**：动态注入 CSS 规则（`user-select: auto !important`），覆盖页面原有的样式限制，恢复文本选择功能。
- **UEditor 解锁**：针对页面中使用的百度 UEditor 富文本编辑器，通过注入脚本（`injected.js`）访问页面上下文中的 `UE` 对象，移除其对粘贴事件的拦截逻辑，恢复编辑器的原生粘贴功能。

### 2. 智能题目提取引擎
- **多模式 DOM 解析**：
  - **作业模式**：解析 `.TiMu`、`.Zy_TItle` 等选择器，提取作业页面中的题目文本和选项。
  - **考试模式**：针对考试页面特殊的 DOM 结构（如 `.singleQuesId`, `.examPaperTitle`），实现了专门的解析算法，支持单选、多选、判断和简答题的提取。
- **跨域 Iframe 通信**：由于超星页面常采用嵌套 Iframe 结构，扩展实现了基于 `postMessage` 的通信机制。主页面（Top Frame）作为控制器，向所有子 Iframe 广播采集指令，子 Iframe 独立采集数据后回传，最终在主页面汇总，解决跨域访问限制问题。

### 3. AI 辅助答题
- **DeepSeek API 集成**：内置 DeepSeek AI 接口集成，将提取的题目上下文发送至 AI 模型进行分析。
- **流式处理**：支持长文本和批量题目的处理，通过优化 Prompt Engineering 提高 AI 对题型的识别率和答案准确性。
- **非侵入式 UI**：AI 答题结果通过独立的浮动面板或 Popup 界面展示，不破坏原有页面布局。

### 4. 现代化 Popup 控制面板
- **实时状态监控**：打开扩展面板时，立即通过 Content Script 扫描当前页面 DOM，实时统计并显示题目数量。
- **智能页面检测**：根据 URL 特征（如 `/exam-ans/`, `/mycourse/`）自动识别当前是“考试页面”、“作业页面”还是“普通页面”，并动态调整 UI 状态（图标、颜色）。
- **极简 UI 设计**：采用黑白简约主题，引入 Nunito 和 Noto Sans SC 字体，配合 RemixIcon 图标库，提供现代化的视觉体验。

## 📦 安装与使用

1.  **下载源码**：克隆或下载本项目到本地。
2.  **加载扩展**：
    *   在 Chrome 浏览器地址栏输入 `chrome://extensions/`。
    *   开启右上角的“开发者模式”。
    *   点击“加载已解压的扩展程序”，选择本项目文件夹。
3.  **使用功能**：
    *   打开超星学习通的作业或考试页面。
    *   点击浏览器工具栏的扩展图标，打开控制面板。
    *   **获取题目**：点击“获取题目”按钮，将自动提取当前页面的所有题目并复制到剪贴板，同时弹窗预览。
    *   **AI 答题**：点击“AI 答题”按钮，扩展将自动提取题目并调用 AI 接口获取答案。

## 📂 项目结构

```text
Fk-Chaoxing-Extension/
├── manifest.json              # 扩展配置文件 (Manifest V3)
├── background.js              # Service Worker，处理后台任务
├── popup.html                 # 扩展弹出层 HTML
├── popup.css                  # 弹出层样式表
├── popup.js                   # 弹出层交互逻辑
├── content-message-handler.js # Content Script 消息路由与处理
├── fk-cx-main.js              # Content Script 入口文件
├── injected.js                # 页面注入脚本（用于访问页面上下文对象）
├── modules/                   # 功能模块目录
│   ├── CopyAllQuestion.js     # 题目提取核心逻辑
│   ├── CopyEnabler.js         # 复制限制解除模块
│   ├── PasteEnabler.js        # 粘贴限制解除模块
│   ├── UEditorUnlock.js       # UEditor 解锁模块
│   ├── logger.js              # 全局日志工具
│   └── ai-answer/             # AI 答题相关模块
│       ├── api.js             # API 通信层
│       ├── core.js            # 核心业务逻辑
│       └── ui.js              # AI 结果展示 UI
├── assets/                    # 静态资源
│   └── TyprMd5.js             # 字体解密工具（如有）
└── icons/                     # 图标资源
```

## 🛠️ 技术栈

*   **Core**: JavaScript (ES6+), HTML5, CSS3
*   **Platform**: Chrome Extension API (Manifest V3)
*   **UI Assets**: RemixIcon, Google Fonts (Nunito, Noto Sans SC)
*   **AI Service**: DeepSeek API

## 📝 更新日志

请查看 [CHANGELOG.md](./CHANGELOG.md) 获取详细的版本更新记录。

## ⚠️ 免责声明

本项目仅供技术研究和学习交流使用。请勿用于任何商业用途或违反相关平台规定的行为。使用本插件产生的任何后果由用户自行承担。
