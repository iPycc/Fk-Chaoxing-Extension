# Requirements Document - 考试题目提取器

## Introduction

扩展现有的 `CopyAllQuestion` 模块，使其支持考试页面的题目提取，包括选择题和简答题。

## Glossary

- **CopyAllQuestion**: 题目复制模块（现有）
- **ExamPage**: 考试页面 (`/exam-ans/mooc2/exam/preview`)
- **StudyPage**: 作业/学习页面 (`/mycourse/studentstudy`)
- **QuestionContainer**: 题目容器
- **ChoiceQuestion**: 选择题（单选/多选）
- **EssayQuestion**: 简答题

## Requirements

### Requirement 1: 识别页面类型

**User Story:** 作为用户，我希望插件能自动识别当前是考试页面还是作业页面，以便使用正确的提取逻辑。

#### Acceptance Criteria

1. WHEN 页面 URL 包含 `/exam-ans/mooc2/exam/preview` THEN 系统 SHALL 识别为考试页面
2. WHEN 页面 URL 包含 `/mycourse/studentstudy` THEN 系统 SHALL 识别为作业页面
3. WHEN 识别页面类型 THEN 系统 SHALL 调用对应的题目提取方法

### Requirement 2: 提取考试选择题

**User Story:** 作为用户，我希望在考试页面点击"复制题目"按钮时，能提取所有选择题。

#### Acceptance Criteria

1. WHEN 在考试页面 THEN 系统 SHALL 查找所有 `.singleQuesId[id^="sigleQuestionDiv_"]` 容器
2. WHEN 处理选择题 THEN 系统 SHALL 从 `h3.mark_name.colorDeep` 提取题目标题
3. WHEN 处理选择题 THEN 系统 SHALL 从 `.stem_answer .answerBg` 提取所有选项
4. WHEN 选项包含 `.num_option` 和 `.answer_p` THEN 系统 SHALL 组合为 "A. 选项内容" 格式
5. WHEN 选项数量 <= 4 THEN 系统 SHALL 标记为单选题
6. WHEN 选项数量 > 4 THEN 系统 SHALL 标记为多选题

### Requirement 3: 提取考试简答题

**User Story:** 作为用户，我希望在考试页面能提取简答题。

#### Acceptance Criteria

1. WHEN 题目容器没有 `.stem_answer` THEN 系统 SHALL 判定为简答题
2. WHEN 处理简答题 THEN 系统 SHALL 从 `h3.mark_name.colorDeep` 提取完整题目
3. WHEN 提取题目 THEN 系统 SHALL 保留题目中的 HTML 内容（如公式、换行）
4. WHEN 简答题没有选项 THEN 系统 SHALL 返回空选项数组

### Requirement 4: 统一数据格式

**User Story:** 作为开发者，我希望考试题目和作业题目使用相同的数据结构。

#### Acceptance Criteria

1. THE 系统 SHALL 为所有题目返回包含以下字段的对象：
   - `title`: 题目标题（字符串）
   - `options`: 选项数组（字符串数组）
   - `type`: 题型标识（'single', 'multi', 'other'）
2. WHEN 格式化输出 THEN 系统 SHALL 使用与作业页面相同的格式

### Requirement 5: 复制按钮显示

**User Story:** 作为用户，我希望在考试页面也能看到"复制题目"按钮。

#### Acceptance Criteria

1. WHEN 在考试页面 THEN 系统 SHALL 在页面顶部显示"复制题目"按钮
2. WHEN 考试页面没有"章节详情"标题 THEN 系统 SHALL 在 `.marking_content` 或 `body` 插入按钮
3. WHEN 按钮样式 THEN 系统 SHALL 与作业页面保持一致

### Requirement 6: 与 AI 模块兼容

**User Story:** 作为用户，我希望提取的考试题目能发送给 AI 获取答案。

#### Acceptance Criteria

1. WHEN AI 模块调用题目提取 THEN 系统 SHALL 返回统一格式的题目数组
2. WHEN 考试页面和作业页面 THEN AI 模块 SHALL 使用相同的处理逻辑
3. WHEN 显示答案 THEN 系统 SHALL 在通知面板正确显示
