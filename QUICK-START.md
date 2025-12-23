# 快速开始指南

## 🎯 5 分钟快速安装

### 第一步：准备文件

确保你有完整的 `chaoxing-extension` 文件夹，包含以下文件：

```
chaoxing-extension/
├── manifest.json          ✅ 必需
├── content-script.js      ✅ 必需
├── injected.js            ✅ 必需
├── assets/
│   ├── TyprMd5.js        ✅ 必需
│   └── table.json        ✅ 必需
└── icons/
    ├── 48.png            ✅ 必需
    └── 128.png           ✅ 必需
```

### 第二步：加载扩展

1. **打开 Chrome 扩展页面**
   - 在地址栏输入: `chrome://extensions/`
   - 或者: 菜单 → 更多工具 → 扩展程序

2. **开启开发者模式**
   - 点击右上角的"开发者模式"开关
   - 确保开关变为蓝色（已开启）

3. **加载扩展**
   - 点击左上角"加载已解压的扩展程序"按钮
   - 选择 `chaoxing-extension` 文件夹
   - 点击"选择文件夹"

4. **验证安装**
   - 扩展列表中出现"Chaoxing Copy & Paste Helper"
   - 状态显示为"已启用"
   - 没有错误提示

### 第三步：测试功能

1. **访问超星网站**
   - 打开任意超星学习通页面
   - 例如: `https://www.chaoxing.com/`

2. **打开开发者工具**
   - 按 F12 键
   - 切换到 Console 标签

3. **查看日志**
   - 搜索 `[Chaoxing Helper]`
   - 应该看到类似以下日志：
   ```
   [Chaoxing Helper] Extension starting...
   [Chaoxing Helper] Initializing early modules...
   [Chaoxing Helper] PasteEnabler initialized
   [Chaoxing Helper] All modules initialized successfully
   ```

4. **测试功能**
   - ✅ 尝试复制粘贴文本（应该可以正常使用）
   - ✅ 尝试选择文本（应该可以正常选择）
   - ✅ 尝试右键菜单（应该可以正常显示）

## ✅ 功能验证清单

### 基础功能

- [ ] 可以复制文本
- [ ] 可以粘贴文本
- [ ] 可以选择文本
- [ ] 可以使用右键菜单
- [ ] 可以在输入框中输入

### 高级功能

- [ ] 加密字体自动解密（如果页面有加密字体）
- [ ] UEditor 可以粘贴（如果页面有 UEditor）
- [ ] "点击复制所有题目"按钮出现（在章节详情页）

## 🐛 常见问题

### 问题 1: 扩展无法加载

**症状**: 点击"加载已解压的扩展程序"后没有反应

**解决方法**:
1. 确保选择的是 `chaoxing-extension` 文件夹（不是父文件夹）
2. 确保文件夹中有 `manifest.json` 文件
3. 检查 `manifest.json` 是否有语法错误

### 问题 2: 扩展加载后显示错误

**症状**: 扩展列表中显示红色错误提示

**解决方法**:
1. 点击"错误"查看详细信息
2. 检查是否缺少文件（特别是 `assets/` 文件夹）
3. 确保所有文件路径正确

### 问题 3: 功能不生效

**症状**: 扩展已加载，但复制粘贴仍然被限制

**解决方法**:
1. 刷新超星页面（Ctrl+R 或 F5）
2. 检查是否在超星域名下（`*.chaoxing.com`）
3. 打开 Console 查看是否有错误日志
4. 确保扩展状态为"已启用"

### 问题 4: 控制台没有日志

**症状**: 打开 Console 看不到 `[Chaoxing Helper]` 日志

**解决方法**:
1. 确保在超星网站上（不是扩展页面）
2. 刷新页面
3. 检查 Console 的过滤器设置
4. 尝试在 Console 中输入: `console.log('[Chaoxing Helper] Test')`

### 问题 5: 一键复制按钮不出现

**症状**: 在章节详情页看不到"点击复制所有题目"按钮

**解决方法**:
1. 确保页面有 `<h2>章节详情</h2>` 标题
2. 等待页面完全加载
3. 刷新页面
4. 检查 Console 是否有相关日志

## 🔧 调试技巧

### 查看扩展日志

```javascript
// 在 Console 中输入以下命令查看所有日志
console.log('Extension loaded:', typeof ChaoxingHelper !== 'undefined');
```

### 手动触发功能

```javascript
// 手动触发字体解密
CopyEnabler.decrypt();

// 手动触发粘贴解除
PasteEnabler.init();

// 手动插入复制按钮
CopyAllQuestion.insertCopyButton();
```

### 检查扩展状态

1. 访问 `chrome://extensions/`
2. 找到"Chaoxing Copy & Paste Helper"
3. 点击"详细信息"
4. 查看"权限"和"网站访问权限"

## 📞 获取帮助

如果以上方法都无法解决问题：

1. **查看完整文档**
   - [完整验证报告](FINAL-VERIFICATION.md)
   - [加载指南](LOADING-GUIDE.md)

2. **检查文件完整性**
   - 确保所有文件都存在
   - 确保文件没有被修改

3. **重新安装**
   - 在扩展页面移除扩展
   - 重新加载扩展

4. **查看错误日志**
   - 打开 Console 查看详细错误
   - 截图错误信息

## 🎉 安装成功！

如果你看到以下内容，说明安装成功：

✅ 扩展列表中显示"Chaoxing Copy & Paste Helper"  
✅ 状态为"已启用"  
✅ Console 中有 `[Chaoxing Helper]` 日志  
✅ 可以正常复制粘贴文本  

现在你可以：
- 在超星网站上自由复制粘贴
- 查看解密后的字体内容
- 在 UEditor 中正常粘贴
- 一键复制所有题目

**享受无限制的学习体验！** 🚀

---

**需要更多帮助？** 查看 [README.md](README.md) 了解详细功能说明。
