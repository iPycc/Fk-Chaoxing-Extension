# Design Document - 考试题目提取器

## Overview

扩展现有的 `CopyAllQuestion` 模块，添加考试页面题目提取功能。通过检测页面类型，自动选择对应的提取策略，保持与现有 AI 模块的兼容性。

## Architecture

### 模块结构
```
CopyAllQuestion (现有模块)
├── extractQuestionsFromDocument() - 作业页面提取（现有）
├── extractExamQuestions() - 考试页面提取（新增）
├── isExamPage() - 页面类型检测（新增）
└── insertCopyButton() - 按钮插入（修改）
```

### 数据流
```
用户点击按钮
    ↓
检测页面类型 (isExamPage)
    ↓
    ├─ 考试页面 → extractExamQuestions()
    └─ 作业页面 → extractQuestionsFromDocument()
    ↓
统一格式化
    ↓
显示/复制/发送给AI
```

## Components and Interfaces

### 1. 页面类型检测

```javascript
// 新增方法
isExamPage() {
  return window.location.href.includes('/exam-ans/mooc2/exam/preview');
}
```

### 2. 考试题目提取器

```javascript
// 新增方法
extractExamQuestions(doc = document) {
  const questions = [];
  
  // 查找所有题目容器
  const containers = doc.querySelectorAll('.singleQuesId[id^="sigleQuestionDiv_"]');
  
  containers.forEach(container => {
    const question = this.parseExamQuestion(container);
    if (question) questions.push(question);
  });
  
  return questions;
}

// 新增辅助方法
parseExamQuestion(container) {
  // 提取题目标题
  const titleEl = container.querySelector('h3.mark_name.colorDeep');
  const title = this.extractExamTitle(titleEl);
  
  // 提取选项
  const options = this.extractExamOptions(container);
  
  // 判断题型
  const type = options.length === 0 ? 'other' : 
               options.length <= 4 ? 'single' : 'multi';
  
  return { title, options, type };
}

extractExamTitle(titleEl) {
  // 从 div[style*="overflow"] 提取题目内容
  const contentDiv = titleEl?.querySelector('div[style*="overflow"]');
  if (contentDiv) {
    return contentDiv.textContent.replace(/\s+/g, ' ').trim();
  }
  return '';
}

extractExamOptions(container) {
  const options = [];
  const optionEls = container.querySelectorAll('.stem_answer .answerBg');
  
  optionEls.forEach(el => {
    const letter = el.querySelector('.num_option')?.textContent.trim();
    const content = el.querySelector('.answer_p')?.textContent.trim();
    if (letter && content) {
      options.push(`${letter}. ${content}`);
    }
  });
  
  return options;
}
```

### 3. 统一提取接口

```javascript
// 修改现有方法
extractQuestionsFromDocument(doc) {
  // 检测页面类型
  if (this.isExamPage()) {
    return this.extractExamQuestions(doc);
  }
  
  // 原有作业页面逻辑
  const questions = [];
  const containers = Array.from(doc.querySelectorAll('.TiMu'));
  // ... 现有代码
  return questions;
}
```

### 4. 按钮插入逻辑

```javascript
// 修改现有方法
insertCopyButton() {
  if (document.getElementById('__cx_copy_all_btn')) return;
  
  let anchor;
  if (this.isExamPage()) {
    // 考试页面：查找 .marking_content 或 body
    anchor = document.querySelector('.marking_content') || 
             document.querySelector('body');
  } else {
    // 作业页面：查找"章节详情"
    anchor = Array.from(document.querySelectorAll('h2'))
      .find(h => h.textContent?.includes('章节详情'));
  }
  
  if (!anchor) return;
  
  const btn = document.createElement('button');
  // ... 按钮创建代码
  
  if (this.isExamPage() && anchor === document.body) {
    // 考试页面：固定在右上角
    btn.style.cssText += ';position:fixed;top:10px;right:20px;';
    document.body.appendChild(btn);
  } else {
    anchor.insertAdjacentElement('afterend', btn);
  }
}
```

## Data Models

### Question 对象结构

```javascript
{
  title: String,      // 题目标题
  options: String[],  // 选项数组 ["A. 选项1", "B. 选项2", ...]
  type: String        // 题型: 'single' | 'multi' | 'other'
}
```

**作业页面示例：**
```javascript
{
  title: "函数y=√(x-2)的定义域是（）",
  options: ["A. x为2", "B. x大于等于2", "C. x为R", "D. x>2"],
  type: "single"
}
```

**考试页面示例：**
```javascript
{
  title: "《桃花源记》中，渔人"处处志之"，却最终"不复得路"，作者这样安排情节有什么用意？",
  options: [],
  type: "other"
}
```

## Correctness Properties

*属性是关于系统应该满足的特性的正式陈述，可以通过测试验证。*

### Property 1: 页面类型识别准确性
*For any* 超星页面 URL，当 URL 包含 `/exam-ans/mooc2/exam/preview` 时，`isExamPage()` 应返回 `true`，否则返回 `false`
**Validates: Requirements 1.1, 1.2**

### Property 2: 考试选择题提取完整性
*For any* 考试页面中的选择题容器，提取的题目对象应包含非空的 `title` 和至少一个 `option`
**Validates: Requirements 2.2, 2.3, 2.4**

### Property 3: 考试简答题提取正确性
*For any* 考试页面中的简答题容器，提取的题目对象应包含非空的 `title` 和空的 `options` 数组
**Validates: Requirements 3.1, 3.2, 3.4**

### Property 4: 题型判断准确性
*For any* 提取的题目，当选项数量 <= 4 时应标记为 'single'，> 4 时应标记为 'multi'，无选项时应标记为 'other'
**Validates: Requirements 2.5, 2.6, 3.1**

### Property 5: 数据格式一致性
*For any* 提取的题目（无论来自考试页面还是作业页面），都应包含 `title`、`options`、`type` 三个字段
**Validates: Requirements 4.1, 4.2**

### Property 6: 按钮显示正确性
*For any* 考试页面或作业页面，当页面加载完成后，应能找到 `__cx_copy_all_btn` 按钮元素
**Validates: Requirements 5.1, 5.2, 5.3**

## Error Handling

### 1. 页面元素缺失
- **场景**: 考试页面结构变化，找不到题目容器
- **处理**: 返回空数组，在控制台输出警告
- **用户体验**: 显示"未找到题目"提示

### 2. 题目解析失败
- **场景**: 单个题目的 HTML 结构异常
- **处理**: 跳过该题目，继续处理其他题目
- **用户体验**: 提取部分题目，不影响整体功能

### 3. 按钮插入失败
- **场景**: 找不到合适的锚点元素
- **处理**: 尝试备用锚点（body），仍失败则放弃
- **用户体验**: 按钮不显示，但不影响其他功能

## Testing Strategy

### Unit Tests
- 测试 `isExamPage()` 对不同 URL 的判断
- 测试 `extractExamTitle()` 提取各种格式的题目标题
- 测试 `extractExamOptions()` 提取不同数量的选项
- 测试题型判断逻辑（单选/多选/简答）

### Property Tests
- **Property 1**: 生成随机 URL，验证页面类型识别
- **Property 2**: 生成随机选择题 HTML，验证提取完整性
- **Property 3**: 生成随机简答题 HTML，验证提取正确性
- **Property 4**: 生成随机选项数量，验证题型判断
- **Property 5**: 对比考试和作业页面提取结果，验证格式一致性

### Integration Tests
- 在真实考试页面测试题目提取
- 在真实作业页面测试题目提取
- 测试与 AI 模块的集成
- 测试按钮在不同页面的显示

## Implementation Notes

### 1. 代码复用
- 尽量复用现有的 `CopyAllQuestion` 方法
- 新增方法命名以 `Exam` 为前缀，便于识别

### 2. 兼容性
- 保持与现有 AI 模块的接口兼容
- 不修改现有作业页面的提取逻辑

### 3. 性能考虑
- 页面类型检测只需一次 URL 判断
- 题目提取使用 `querySelectorAll` 批量查询

### 4. 可维护性
- 将考试页面相关代码集中在一起
- 添加详细注释说明 HTML 结构
