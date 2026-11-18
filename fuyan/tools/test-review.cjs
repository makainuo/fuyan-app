'use strict';

// 回归测试：普通 Markdown（带 YAML frontmatter）不能被误判成 zailao-review。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseReview, parseReviewJson } = require('../lib/review');

const plain = `---
title: 普通笔记
---

# 普通笔记

## 名词解释

1. 示例术语：这是定义。
`;
assert.strictEqual(parseReview(plain), null, '普通 Markdown 不应进入 review 解析');

const reviewMd = fs.readFileSync(path.join(__dirname, '..', 'web', 'content', 'review-template.md'), 'utf8');
const parsedMd = parseReview(reviewMd);
assert(parsedMd, 'review-template.md 应该能解析');
assert.strictEqual(parsedMd.questions.length, 2);

const reviewJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'content', 'review-template.json'), 'utf8'));
const parsedJson = parseReviewJson(JSON.stringify(reviewJson));
assert.strictEqual(parsedJson.questions.length, 6);

console.log('review parser tests passed');
