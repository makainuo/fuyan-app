'use strict';

const { createHash } = require('node:crypto');

const types = new Map([
  ['简答题', 'short'], ['简答', 'short'], ['问答', 'short'], ['问答题', 'short'],
  ['名词解释', 'explain'], ['名词解释题', 'explain'], ['名解', 'explain'],
]);
const labels = { single: '单选题', multi: '多选题', explain: '名词解释', short: '简答题', case: '病例分析', fill: '填空题', truefalse: '判断题' };
const heading = /^#{1,6}\s+(.+?)\s*#*$/;
const separator = /^\s*---\s*$/;
const number = /^\s*(\d+)[.．、)）]\s*(\S.*)$/;
const field = /^\s*(正确答案|参考答案|答案|解析|英文)\s*[:：]\s*(.*)$/;

function addQuestion(section, { stem, answer, english, explanation, options, correct, caseText, topic, source, originalAnswer }, occurrence) {
  const key = section.type + '\n' + stem.replace(/\s+/g, ' ');
  const count = (occurrence.get(key) || 0) + 1;
  occurrence.set(key, count);
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 20);
  section.questions.push({
    id: 'review-' + hash + '-' + count,
    type: section.type,
    topic: topic || section.title,
    stem,
    stemEn: english,
    answerText: Array.isArray(answer) ? answer : answer ? [answer] : [],
    explain: explanation,
    ...(options ? { options, answer: correct } : {}),
    ...(caseText ? { caseText } : {}),
    ...(source ? { source } : {}),
    ...(originalAnswer ? { originalAnswer } : {}),
  });
}

function buildDetectedReview(detected, title) {
  if (!detected.length) return null;
  const occurrence = new Map();
  const sections = Object.entries(labels).flatMap(([type, label]) => {
    const matches = detected.filter((question) => question.type === type);
    if (!matches.length) return [];
    const section = { title: label, type, questions: [] };
    for (const question of matches) addQuestion(section, question, occurrence);
    return [section];
  });
  // Questions without a reliable answer can be read in the workspace.
  const questions = sections.flatMap((section) => section.questions.filter((q) => q.answerText.length));
  return { title, schema: 'zailao-review@1', sections, questions, detectedCount: detected.length };
}

function parseReviewJson(source) {
  let data;
  try {
    data = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('JSON 语法有误，请检查引号、逗号和括号。');
  }
  if (data?.schema !== 'zailao-review@1') throw new Error('复习资料 JSON 的 schema 必须是 zailao-review@1。');
  const readText = (value, field, optional = false) => {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || (!optional && !value.trim())) throw new Error(field + ' 必须是' + (optional ? '' : '非空') + '文本。');
    return value.trim();
  };
  const title = readText(data.title, 'title');
  if (!Array.isArray(data.sections)) throw new Error('sections 必须是题型区块数组，可以为空。');
  if (data.notes !== undefined && !Array.isArray(data.notes)) throw new Error('notes 必须是讲义章节数组。');
  const notes = (data.notes || []).map((note, index) => {
    const location = '第 ' + (index + 1) + ' 个讲义章节';
    const noteTitle = readText(note?.title, location + '的 title');
    if (!Array.isArray(note.blocks) || !note.blocks.length) throw new Error(location + '至少需要一个内容块。');
    const blocks = note.blocks.map((block, i) => {
      const label = location + '的第 ' + (i + 1) + ' 个内容块';
      if (block?.type === 'heading' || block?.type === 'paragraph') {
        return { type: block.type, text: readText(block.text, label + '的 text') };
      }
      if (block?.type === 'list' && Array.isArray(block.items) && block.items.length) {
        return { type: 'list', items: block.items.map((item) => readText(item, label + '的列表项')) };
      }
      if (block?.type === 'table' && Array.isArray(block.headers) && block.headers.length && Array.isArray(block.rows)) {
        const cells = (row) => row.map((cell) => readText(cell, label + '的单元格', true));
        const rows = block.rows.map((row) => {
          if (!Array.isArray(row) || row.length !== block.headers.length) throw new Error(label + '的表格行宽和表头不一致。');
          return cells(row);
        });
        return { type: 'table', headers: cells(block.headers), rows };
      }
      throw new Error(label + '格式有误，请使用 heading、paragraph、list 或 table。');
    });
    return { id: 'note-' + (index + 1), title: noteTitle, blocks };
  });

  const occurrence = new Map();
  const sections = data.sections.flatMap((entry, index) => {
    const location = '第 ' + (index + 1) + ' 个区块';
    const type = entry?.type;
    if (typeof type !== 'string' || !Object.hasOwn(labels, type) || type === 'truefalse') throw new Error(location + '的 type 必须是 single、multi、explain、short、case 或 fill。');
    if (!Array.isArray(entry.questions)) throw new Error(location + '的 questions 必须是数组。');
    if (!entry.questions.length) return [];
    const section = { id: 's' + (index + 1), title: labels[type], type, questions: [] };
    entry.questions.forEach((question, i) => {
      const prefix = location + '第 ' + (i + 1) + ' 题的 ';
      const common = {
        stem: readText(question?.stem, prefix + 'stem'),
        english: readText(question?.english, prefix + 'english', true),
        explanation: readText(question?.explanation, prefix + 'explanation', true),
        topic: readText(question?.topic, prefix + 'topic', true),
        source: readText(question?.source, prefix + 'source', true),
      };
      if (type === 'single' || type === 'multi') {
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 26) {
          throw new Error(prefix + 'options 必须包含 2 至 26 个选项。');
        }
        const options = question.options.map((option, j) => ({ zh: readText(option, prefix + '选项 ' + String.fromCharCode(65 + j)) }));
        const letters = type === 'single' ? [question.answer] : question.answer;
        const correct = Array.isArray(letters) && letters.map((letter) => typeof letter === 'string' && /^[A-Z]$/.test(letter) ? letter.charCodeAt(0) - 65 : -1);
        if (!correct || correct.length < (type === 'multi' ? 2 : 1) || new Set(correct).size !== correct.length || correct.some((j) => j < 0 || j >= options.length)) {
          throw new Error(prefix + (type === 'single' ? 'answer 必须是一个有效的选项字母，例如 "A"。' : 'answer 必须包含至少两个不同的有效选项字母，例如 ["A", "C"]。'));
        }
        addQuestion(section, { ...common, options, correct, answer: [...letters].sort().join('、') }, occurrence);
      } else {
        let answer = question.answer;
        if (type === 'fill' && Array.isArray(answer) && answer.length) {
          answer = answer.map((value, j) => readText(value, prefix + '第 ' + (j + 1) + ' 空的答案'));
        } else answer = readText(answer, prefix + 'answer');
        const caseText = type === 'case' ? readText(question.caseText, prefix + 'caseText', true) : '';
        addQuestion(section, { ...common, answer, caseText }, occurrence);
      }
    });
    return [section];
  });
  if (!sections.length && !notes.length) throw new Error('复习资料至少需要一道题或一个讲义章节。');
  return { title, schema: data.schema, notes, sections, questions: sections.flatMap((section) => section.questions) };
}

function parseReview(source) {
  const lines = source.replace(/^\uFEFF/, '').replace(/<!--[^]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, '')).split(/\r?\n/);
  const headerEnd = separator.test(lines[0]) ? lines.findIndex((line, i) => i > 0 && separator.test(line)) : -1;
  const header = lines.slice(1, Math.max(1, headerEnd));
  const format = header.find((line) => /^format\s*:\s*zailao-review@/i.test(line));
  // 只有显式声明 format 才走复习资料格式，避免把带 YAML frontmatter 的普通笔记误判。
  if (!format) return null;
  if (format && !/^format\s*:\s*zailao-review@1\s*$/i.test(format)) throw new Error('不支持的复习资料格式版本，请使用 zailao-review@1。');

  const title = header.find((line) => /^title\s*:/.test(line))?.replace(/^title\s*:\s*/, '').trim();
  const sections = [];
  const occurrence = new Map();
  let section;
  let item;
  let currentField;

  function finishQuestion() {
    if (!item) return;
    const answer = item.answer.join('\n').trim();
    if (!answer) throw new Error(`第 ${item.line} 行的题目「${item.stem}」缺少答案。`);
    addQuestion(section, {
      stem: item.stem,
      english: item.english.join(' ').trim(),
      answer,
      explanation: item.explanation.join('\n').trim(),
    }, occurrence);
    item = null;
  }

  for (let i = headerEnd + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (separator.test(line)) { finishQuestion(); continue; }
    const h = heading.exec(line.trim());
    if (h) {
      finishQuestion();
      const type = types.get(h[1]);
      if (!type) throw new Error(`第 ${lineNo} 行的标题「${h[1]}」不是简答题或名词解释。`);
      section = { id: `s${sections.length + 1}`, title: labels[type], type, line: lineNo, questions: [] };
      sections.push(section);
      continue;
    }
    const q = number.exec(line);
    // A numbered line inside a field is a continuation. Use --- between questions.
    if (q && !item) {
      if (!section) throw new Error(`第 ${lineNo} 行的题目缺少「## 简答题」或「## 名词解释」标题。`);
      item = { stem: q[2].trim(), line: lineNo, answer: [], explanation: [], english: [] };
      currentField = null;
      continue;
    }
    const f = field.exec(line);
    if (f && item) {
      currentField = f[1] === '解析' ? 'explanation' : f[1] === '英文' ? 'english' : 'answer';
      if (item[currentField].length) throw new Error(`第 ${lineNo} 行重复使用「${f[1]}」，如果是下一题，请先用 --- 分隔。`);
      item[currentField].push(f[2]);
    } else if (item && currentField) {
      item[currentField].push(line.trim());
    } else if (line.trim()) {
      throw new Error(`第 ${lineNo} 行无法识别。请使用题号、答案字段，并用 --- 分隔每道题。`);
    }
  }
  finishQuestion();
  if (!sections.length) throw new Error('没有找到简答题或名词解释区块。');
  const empty = sections.find((s) => !s.questions.length);
  if (empty) throw new Error(`第 ${empty.line} 行的「${empty.title}」没有题目。`);
  return { title: title?.replace(/^(['"])(.*)\1$/, '$2'), sections, questions: sections.flatMap((s) => s.questions) };
}

function renderReview(review, title, id, esc, originalSections = []) {
  const notes = (review.notes || []).map((note) => ({
    ...note,
    body: '<div class="workspace-prose">' + note.blocks.map((block) => {
      if (block.type === 'heading') return '<h3>' + esc(block.text) + '</h3>';
      if (block.type === 'paragraph') return '<p>' + esc(block.text) + '</p>';
      if (block.type === 'list') return '<ul>' + block.items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>';
      const headers = block.headers.map((cell) => '<th scope="col">' + esc(cell) + '</th>').join('');
      const rows = block.rows.map((row) => '<tr>' + row.map((cell) => '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('');
      return '<div class="table-wrap"><table><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('') + '</div>',
  }));
  const sections = review.sections.map((section) => {
    const cards = section.questions.map((q, i) => {
      const answer = q.type === 'truefalse' && q.answerText.length
        ? (q.answerText[0] === 'true' ? '正确' : '错误') : q.answerText.join('；');
      return `
      <article class="review-card">
        ${q.caseText ? `<p class="review-case">${esc(q.caseText)}</p>` : ''}
        <h3 id="${q.id}"><span>${i + 1}.</span> ${esc(q.stem)}</h3>
        ${q.options ? `<ol class="review-options" type="A">${q.options.map((o) => `<li>${esc(o.zh)}</li>`).join('')}</ol>` : ''}
        <details class="reveal">
          <summary>参考答案</summary>
          <div class="review-answer">
          ${q.stemEn ? `<p class="review-term" lang="en">${esc(q.stemEn)}</p>` : ''}
          <p>${esc(answer || (q.originalAnswer ? '原文答案（未用于自动判分）\n' + q.originalAnswer : '原文未附可确认的答案。'))}</p>
          ${q.explain ? `<p class="review-label">解析</p><p>${esc(q.explain)}</p>` : ''}
          ${q.source ? `<p class="review-label">来源</p><p>${esc(q.source)}</p>` : ''}
          </div>
        </details>
      </article>`;
    }).join('\n');
    return {
      ...section,
      count: section.questions.length,
      quizType: section.questions.some((q) => q.answerText.length) ? (review.schema ? section.type : 'text') : '',
      body: cards,
    };
  });
  return renderWorkspace({
    title, id, sections: notes.concat(sections, originalSections), questionCount: review.detectedCount ?? review.questions.length,
    practiceCount: review.questions.length, esc,
  });
}

function renderWorkspace({ title, id, sections, questionCount = 0, practiceCount = questionCount, esc }) {
  const quizUrl = '/#/quiz/' + encodeURIComponent(id);
  const sectionLinks = sections.map((section) =>
    `<a href="#${esc(section.id)}">${esc(section.title)}${section.count ? `<span>${section.count}</span>` : ''}</a>`).join('');
  const content = sections.map((section) => `
    <section class="workspace-section" id="${esc(section.id)}">
      <header class="workspace-section-head">
        <h2>${esc(section.title)}</h2>
        ${section.quizType ? `<a class="workspace-practice" href="${quizUrl}?type=${section.quizType}" target="_top">练本题型 <span aria-hidden="true">→</span></a>` : ''}
      </header>
      ${section.body}
    </section>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/content/review.css"><link rel="stylesheet" href="/content/review-b.css"></head>
<body class="review-board"><main>
  <header class="workspace-cover">
    <div><h1 class="review-title">${esc(title)}</h1><p>${[sections.some((s) => !s.count) ? sections.filter((s) => !s.count).length + ' 个讲义章节' : '', questionCount ? questionCount.toLocaleString('zh-CN') + ' 道题' : ''].filter(Boolean).join(' · ')}</p></div>
    ${practiceCount ? `<a class="workspace-start" href="${quizUrl}" target="_top">开始刷题 <span aria-hidden="true">→</span></a>` : ''}
  </header>
  <div class="workspace-tools">
    <nav class="workspace-jumps" aria-label="章节与题型">${sectionLinks}</nav>
    ${questionCount ? `<div class="review-actions">
      <button type="button" data-act="expand-all">展开全部答案</button>
      <button type="button" data-act="collapse-all">收起全部答案</button>
    </div>` : ''}
  </div>
  ${content}
</main></body></html>`;
}

module.exports = { parseReview, parseReviewJson, buildDetectedReview, renderReview, renderWorkspace };
