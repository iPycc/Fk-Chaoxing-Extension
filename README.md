# Chaoxing Copy & Paste Helper

一款专为超星学习通平台设计的 Chrome 扩展，解除页面复制粘贴限制，支持字体解密与题目批量导出。

## ✨ 功能特性

### 解除复制粘贴限制
- 移除页面全局事件拦截（paste、copy、cut、contextmenu 等）
- 强制启用文本选择（user-select: text）
- 自动处理动态加载的输入框和富文本编辑器
- 支持 iframe 嵌套页面

### 字体解密
- 自动识别并解密 `font-cxsecret` 加密字体
- 基于字形路径 MD5 哈希匹配还原原始字符
- 无感知完成解密，保持页面原有样式

### 一键复制题目
- 智能提取页面所有题目及选项
- 支持单选、多选、简答等多种题型
- 递归采集嵌套 iframe 中的题目内容
- 提供预览编辑弹窗，支持二次编辑后复制

### 📄 UEditor 富文本编辑器解锁
- 注入页面上下文访问 `window.UE` 实例
- 自动启用编辑器粘贴功能
- 移除 readonly/disabled 限制

## 项目结构

```
├── manifest.json           # 扩展配置文件
├── fk-cx-main.js          # 主入口，模块调度
├── injected.js            # 页面上下文注入脚本
├── modules/
│   ├── PasteEnabler.js    # 复制粘贴限制解除模块
│   ├── CopyEnabler.js     # 字体解密模块
│   ├── CopyAllQuestion.js # 题目批量导出模块
│   └── UEditorUnlock.js   # UEditor 解锁模块
├── assets/
│   ├── TyprMd5.js         # Typr 字体解析 & MD5 依赖
│   └── table.json         # 字符映射表
└── icons/                 # 扩展图标
```

## 技术实现

| 模块 | 技术方案 |
|------|----------|
| PasteEnabler | MutationObserver 监听 DOM 变化，实时移除事件限制 |
| CopyEnabler | Typr.js 解析 WOFF 字体，MD5 哈希匹配字符映射 |
| CopyAllQuestion | 递归遍历 iframe，postMessage 跨域通信 |
| UEditorUnlock | Script 注入突破 Content Script 隔离沙箱 |

## 安装方式

### 开发者模式安装
1. 下载或克隆本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目根目录

## 兼容性

- Chrome / Edge / Brave 等 Chromium 内核浏览器
- Manifest V3
- 支持超星学习通全站（`*.chaoxing.com`）

## 许可证

MIT License

## ⚠️ 免责声明

本扩展仅供学习研究使用，请勿用于任何违反平台规定或法律法规的行为。使用本扩展所产生的一切后果由用户自行承担。
