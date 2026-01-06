# Implementation Plan: 考试题目提取器

## Overview

扩展 `CopyAllQuestion` 模块，添加考试页面题目提取功能，保持与 AI 模块的兼容性。

## Tasks

- [x] 1. 添加页面类型检测
  - 在 `CopyAllQuestion` 中添加 `isExamPage()` 方法
  - 检测 URL 是否包含 `/exam-ans/mooc2/exam/preview`
  - _Requirements: 1.1, 1.2_

- [x] 2. 实现考试题目提取核心逻辑
  - [x] 2.1 添加 `extractExamQuestions()` 方法
    - 查找所有 `.singleQuesId[id^="sigleQuestionDiv_"]` 容器
    - 遍历容器调用 `parseExamQuestion()`
    - _Requirements: 2.1_

  - [x] 2.2 实现 `parseExamQuestion()` 方法
    - 调用 `extractExamTitle()` 提取题目
    - 调用 `extractExamOptions()` 提取选项
    - 根据选项数量判断题型
    - _Requirements: 2.2, 2.3, 2.5, 2.6_

  - [x] 2.3 实现 `extractExamTitle()` 方法
    - 从 `h3.mark_name.colorDeep` 查找题目元素
    - 从 `div[style*="overflow"]` 提取题目内容
    - 清理空白字符
    - _Requirements: 2.2, 3.2_

  - [x] 2.4 实现 `extractExamOptions()` 方法
    - 查找所有 `.stem_answer .answerBg` 选项元素
    - 提取 `.num_option` 的选项字母
    - 提取 `.answer_p` 的选项内容
    - 组合为 "A. 内容" 格式
    - _Requirements: 2.3, 2.4_

- [x] 3. 修改现有提取方法
  - 在 `extractQuestionsFromDocument()` 开头添加页面类型检测
  - 如果是考试页面，调用 `extractExamQuestions()`
  - 保持原有作业页面逻辑不变
  - _Requirements: 1.3, 4.2_

- [x] 4. 修改按钮插入逻辑
  - [x] 4.1 更新 `insertCopyButton()` 方法
    - 添加页面类型检测
    - 考试页面：查找 `.marking_content` 或 `body` 作为锚点
    - 作业页面：保持原有逻辑
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 调整考试页面按钮样式
    - 如果锚点是 `body`，使用固定定位（右上角）
    - 否则使用相对定位
    - _Requirements: 5.2_

- [x] 5. 更新 AI 模块兼容性
  - [x] 5.1 验证 `AIAnswerUI` 的页面检测
    - 确保 `isExamPage()` 方法存在
    - 确保 `shouldShowUI()` 包含考试页面
    - _Requirements: 6.1_

  - [x] 5.2 验证 `AIAnswerCore` 的题目收集
    - 确保调用 `CopyAllQuestion.extractQuestionsFromDocument()`
    - 验证返回的数据格式
    - _Requirements: 6.2_

- [ ] 6. 测试和验证
  - [ ]* 6.1 单元测试
    - 测试 `isExamPage()` 方法
    - 测试 `extractExamTitle()` 方法
    - 测试 `extractExamOptions()` 方法
    - 测试题型判断逻辑

  - [ ]* 6.2 集成测试
    - 在真实考试页面测试题目提取
    - 测试"复制题目"按钮功能
    - 测试 AI 答题功能
    - 验证数据格式一致性

- [x] 7. 更新 manifest.json
  - 确保 `ExamExtractor.js` 已添加到 content_scripts
  - 验证加载顺序正确
  - _Requirements: 所有_

- [x] 8. 最终检查
  - 确保所有测试通过
  - 验证考试页面和作业页面都能正常工作
  - 检查控制台无错误

## Notes

- 任务标记 `*` 为可选测试任务
- 每个任务引用了对应的需求编号
- 建议按顺序执行任务
- 核心逻辑在任务 2，优先完成
