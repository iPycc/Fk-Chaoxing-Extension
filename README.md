# 超星复制粘贴助手 Chrome 扩展

一键解除超星学习通的复制粘贴限制，支持字体解密、UEditor 粘贴、一键复制题目等功能。

## ✨ 功能特性

- 🔓 **解除限制**: 自动解除复制、粘贴、选择、右键等限制
- 🔤 **字体解密**: 自动解密超星加密字体，显示真实内容
- 📝 **UEditor 支持**: 在百度富文本编辑器中正常粘贴
- 📋 **一键复制**: 一键复制页面所有题目（含选项）
- 🖼️ **iframe 支持**: 自动处理嵌套 iframe 中的内容
- 🔒 **安全合规**: 不收集数据，不发送网络请求

## 📦 安装方法

### 方法一：开发者模式加载（推荐）

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `chaoxing-extension` 文件夹
6. 安装完成！

### 方法二：打包安装

1. 在 `chrome://extensions/` 页面
2. 点击"打包扩展程序"
3. 选择 `chaoxing-extension` 文件夹
4. 生成 `.crx` 文件
5. 拖拽 `.crx` 文件到扩展页面安装

## 🚀 使用说明

### 自动功能（无需操作）

扩展安装后，访问超星网站时会自动：
- ✅ 解除所有复制粘贴限制
- ✅ 解密加密字体
- ✅ 启用 UEditor 粘贴功能
- ✅ 处理动态加载的元素

### 一键复制题目

1. 访问超星章节详情页面
2. 找到"点击复制所有题目"按钮（在"章节详情"标题后）
3. 点击按钮，查看题目预览
4. 点击"一键复制"，题目复制到剪贴板
5. 粘贴到任意位置使用

## 📁 文件结构

```
chaoxing-extension/
├── manifest.json              # 扩展配置文件
├── content-script.js          # 主逻辑脚本
├── injected.js                # 页面注入脚本
├── assets/
│   ├── TyprMd5.js            # 字体解析库
│   └── table.json            # 字符映射表
├── icons/
│   ├── 48.png                # 扩展图标
│   └── 128.png               # 扩展图标
└── README.md                 # 本文档
```

## 🔍 调试方法

如果遇到问题，可以通过以下方式调试：

1. 打开 Chrome DevTools (按 F12)
2. 切换到 Console 标签
3. 搜索 `[Chaoxing Helper]` 查看日志
4. 检查是否有错误信息

### 常见日志信息

```
[Chaoxing Helper] Extension starting...
[Chaoxing Helper] Initializing early modules (document_start)...
[Chaoxing Helper] Global styles injected
[Chaoxing Helper] Global restrictions removed
[Chaoxing Helper] PasteEnabler initialized
[Chaoxing Helper] Page script injected successfully
[Chaoxing Helper] DOM ready, initializing DOM modules...
[Chaoxing Helper] Decryption completed: 42 characters
[Chaoxing Helper] Modal injected successfully
[Chaoxing Helper] Copy button inserted successfully
[Chaoxing Helper] All modules initialized successfully
```

## 🛠️ 技术架构

### 核心模块

1. **PasteEnabler**: 解除复制粘贴限制
   - 移除全局事件限制
   - 注入 CSS 样式
   - 监听动态元素

2. **CopyEnabler**: 字体解密
   - 解析加密字体
   - 构建字符映射
   - 替换加密文本

3. **CopyAllQuestion**: 一键复制题目
   - 提取题目和选项
   - 递归收集 iframe
   - 跨域通信

4. **Page Script**: UEditor 支持
   - 注入页面上下文
   - 检测 UEditor 实例
   - 启用粘贴功能

### 执行流程

```
document_start
    ↓
初始化早期模块
    ├─ 注入全局样式
    ├─ 移除事件限制
    ├─ 启动 MutationObserver
    └─ 注入 Page Script
    ↓
DOMContentLoaded
    ↓
初始化 DOM 模块
    ├─ 字体解密
    └─ 一键复制功能
```

## 📋 需求对照

| 功能 | 状态 | 说明 |
|------|------|------|
| 字体解密 | ✅ | 自动解密 `.font-cxsecret` 加密字体 |
| 粘贴解除 | ✅ | 移除所有复制粘贴限制 |
| UEditor 支持 | ✅ | 在富文本编辑器中正常粘贴 |
| 一键复制 | ✅ | 复制所有题目和选项 |
| iframe 支持 | ✅ | 处理嵌套 iframe 内容 |
| 动态元素 | ✅ | 自动处理动态加载的元素 |
| 跨域通信 | ✅ | postMessage 与 iframe 通信 |

## 🔒 隐私与安全

本扩展：
- ✅ 不收集任何用户数据
- ✅ 不发送任何网络请求
- ✅ 不篡改请求或响应
- ✅ 不绕过登录或权限
- ✅ 仅在超星域名下运行
- ✅ 开源透明，代码可审查

## 📄 许可证

本项目基于原始油猴脚本改编，遵循相同的开源协议。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📚 相关文档

- [完整验证报告](FINAL-VERIFICATION.md)
- [加载指南](LOADING-GUIDE.md)
- [功能对比](VERIFICATION.md)
- [需求文档](../.kiro/specs/chaoxing-chrome-extension/requirements.md)
- [设计文档](../.kiro/specs/chaoxing-chrome-extension/design.md)

## ⚠️ 免责声明

本扩展仅用于学习和研究目的，用户应遵守超星平台的使用条款。使用本扩展产生的任何后果由用户自行承担。

---

**版本**: 1.0.0  
**更新时间**: 2024年12月24日  
**状态**: ✅ 已完成，可投入使用
