# 更新日志

## [1.3.1] - 2026-01-06

### ✨ 新增功能

#### 弹出窗口控制面板
- 添加了简约美观的弹出窗口控制面板
- 点击浏览器扩展图标即可打开
- 集成所有核心功能于一个面板

#### 功能按钮
- **🔄 重载扩展**: 快速重新加载扩展
- **↻ 刷新页面**: 刷新当前超星页面
- **📋 获取所有题目**: 提取并复制所有题目
- **🤖 复制并询问AI**: 提取题目并获取 AI 答案

#### 实时运行日志
- 详细记录所有操作过程
- 带时间戳的日志条目
- 颜色区分不同类型（info/success/error/warning）
- 自动滚动到最新日志
- 支持清空日志功能

#### 页面状态显示
- 自动检测当前页面类型（考试/作业/其他）
- 实时显示题目数量
- 显示提取方法信息

#### 作者信息
- 显示插件名称和版本
- 提供 GitHub 和脚本猫链接
- 简洁的作者信息展示

### 🐛 Bug 修复

#### 考试页面按钮显示问题
- 修复了考试页面按钮不显示的问题
- 添加了重试机制（每 500ms 重试，最多 10 次）
- 扩展了锚点选择器，提高兼容性

#### 弹窗重复显示修复
- 修复了点击“获取所有题目”时，页面中所有 iframe 都会弹出模态窗口的问题
- 限制了消息处理逻辑仅在顶层窗口（Main Frame）执行
- 避免了重复的题目提取和 AI 分析请求

#### UI 重新设计
- 采用简约黑白主题，引入 Google Fonts (Nunito, Noto Sans SC) 优化字体体验
- 优化了布局结构，提升视觉体验，去除“刷新页面”按钮
- 增加了状态指示点和图标（RemixIcon），更直观地显示页面类型
- 实时统计题目数量：打开面板即显示当前题目数，无需手动点击

#### 图标更新
- 替换为全新的 `chaoxing.png` Logo
- Popup 面板和扩展图标同步更新

#### 页面元素检测
- 新增 5 个可能的锚点元素
- 包括：`.examPaperTitle`、`.exam_main`、`#examPaperDiv` 等
- 提高了在不同页面结构下的成功率

#### AI 模块初始化
- 修复了 AI 模块在考试页面不初始化的问题
- 更新为使用 `shouldShowUI()` 方法
- 确保考试和作业页面都能正常使用 AI 功能

### 🔧 优化改进

#### 按钮定位优化
- 考试页面按钮统一使用固定定位
- 显示在页面右上角，避免遮挡内容
- AI 按钮位置调整，避免与复制按钮重叠

#### 调试日志增强
- 在关键位置添加 `console.log` 输出
- 方便排查问题和确认执行状态
- 包括页面类型、锚点信息、按钮插入状态等

#### 消息通信机制
- 新增 `content-message-handler.js` 处理消息
- 支持 popup 与 content script 通信
- 实现异步操作和实时反馈

### 📝 文档更新

- 新增 `POPUP_USAGE.md` - 弹出窗口使用说明
- 新增 `QUICK_START.md` - 快速开始指南
- 新增 `CHANGELOG.md` - 更新日志
- 更新 `DEBUG_GUIDE.md` - 调试指南
- 更新 `IMPLEMENTATION_SUMMARY.md` - 实现总结

### 🗂️ 文件变更

#### 新增文件
- `popup.html` - 弹出窗口 HTML
- `popup.css` - 弹出窗口样式
- `popup.js` - 弹出窗口逻辑
- `content-message-handler.js` - 消息处理器
- `POPUP_USAGE.md` - 使用说明
- `QUICK_START.md` - 快速开始
- `CHANGELOG.md` - 更新日志

#### 修改文件
- `manifest.json` - 添加 popup 配置和消息处理器
- `modules/CopyAllQuestion.js` - 添加重试机制和调试日志
- `modules/ai-answer/index.js` - 修复初始化逻辑
- `modules/ai-answer/ui.js` - 优化按钮插入逻辑

---

## [1.3.0] - 2026-01-05

### ✨ 新增功能

#### 考试页面支持
- 实现考试页面题目提取功能
- 支持选择题和简答题
- 自动判断题型（单选/多选/简答）

#### 页面类型检测
- 自动识别考试页面和作业页面
- 根据页面类型选择对应的提取策略

#### 统一数据格式
- 考试和作业页面使用相同的数据结构
- 包含 `title`、`options`、`type` 字段

#### AI 模块兼容
- AI 模块支持考试页面
- 使用统一接口收集题目
- 考试和作业页面使用相同的处理逻辑

### 📝 实现细节

#### CopyAllQuestion 模块
- 新增 `isExamPage()` - 页面类型检测
- 新增 `extractExamQuestions()` - 考试题目提取
- 新增 `parseExamQuestion()` - 单个题目解析
- 新增 `extractExamTitle()` - 题目标题提取
- 新增 `extractExamOptions()` - 选项提取
- 修改 `extractQuestionsFromDocument()` - 集成页面类型检测
- 修改 `insertCopyButton()` - 支持考试页面按钮插入

#### AI 模块
- `AIAnswerUI.isExamPage()` - 考试页面检测
- `AIAnswerUI.shouldShowUI()` - UI 显示条件
- `AIAnswerUI.insertExamButtons()` - 考试页面按钮插入
- `AIAnswerCore.collectQuestions()` - 使用统一接口

### 📚 文档
- 新增 `requirements.md` - 需求文档
- 新增 `design.md` - 设计文档
- 新增 `tasks.md` - 任务列表
- 新增 `IMPLEMENTATION_SUMMARY.md` - 实现总结
- 新增 `FINAL_VERIFICATION_CHECKLIST.md` - 验证清单

---

## [1.2.0] - 之前版本

### 功能
- 基础的题目复制功能
- 作业页面题目提取
- AI 答题功能
- 复制粘贴启用
- 富文本编辑器解锁

---

## 版本说明

### 版本号规则
- 主版本号：重大功能更新或架构变更
- 次版本号：新功能添加
- 修订号：Bug 修复和小优化

### 更新类型
- ✨ 新增功能
- 🐛 Bug 修复
- 🔧 优化改进
- 📝 文档更新
- 🗂️ 文件变更
- ⚠️ 重要提示
- 🔒 安全更新

---

**最后更新**: 2026-01-06
