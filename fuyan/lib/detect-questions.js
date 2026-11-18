'use strict';

const questionLine = /^(?:(?:第\s*)?(\d+)\s*[.．、)）:：题]|(问(?:题)?|题干)\s*[:：])\s*(\S.*)$/;
const optionLine = /^([A-ZＡ-Ｚ])[.．、)）:：]\s*(\S.*)$/i;
const fieldLine = /^(?:【(正确答案|参考答案|标准答案|答案要点|答案|答|参考解析|答案解析|解析|英文|病例资料|病例材料|病例|病史)】\s*[:：]?|(正确答案|参考答案|标准答案|答案要点|答案|答|参考解析|答案解析|解析|英文|病例资料|病例材料|病例|病史)\s*[:：])\s*(.*)$/;
const typeHeading = /^(?:[一二三四五六七八九十\d]+[、.．]\s*)?(单项选择题|单选题?|不定项选择题|多项选择题|多选题?|选择题|判断题?|填空题?|名词解释题?|名词题|名解|简答题?|问答题?|病例分析题?|案例分析题?)(?:\s*[（(].*[）)])?\s*[:：]?$/;
const answerHeading = /^(?:参考|正确|标准)?答案(?:汇总|与解析|及解析|表)?\s*[:：]?$/;
const questionEnding = /[？?]|^(?:简述|试述|说明|列举|请(?:写|列|分析|回答)|分析|根据.+[，,])/;
const inlineAnswer = /\s*[(（]\s*([A-ZＡ-Ｚ]{1,8})\s*[)）]\s*$/i;

function typeOf(title) {
  const name = typeHeading.exec(title)?.[1];
  if (!name) return '';
  if (/^单/.test(name)) return 'single';
  if (/^(?:多|不定项)/.test(name)) return 'multi';
  if (name === '选择题') return 'choice';
  if (/^判/.test(name)) return 'truefalse';
  if (/^填/.test(name)) return 'fill';
  if (name.startsWith('名')) return 'explain';
  if (/^(病例|案例)/.test(name)) return 'case';
  return 'short';
}

function choiceLetters(value) {
  const compact = value.normalize('NFKC').toUpperCase().replace(/[\s、,，;；/／]/g, '');
  return /^[A-Z]+$/.test(compact) && new Set(compact).size === compact.length ? [...compact] : [];
}

function splitOptions(line) {
  return line.split(/\s+(?=[A-ZＡ-Ｚ][.．、)）:：]\s*\S)/);
}

function appendOption(item, line) {
  const option = optionLine.exec(line);
  if (option) item.options.set(option[1].normalize('NFKC').toUpperCase(), option[2]);
}

function newItem(stem, n, explicit, type, topic) {
  return { n, explicit, type, topic, stem: [stem], options: new Map(), answer: [], explanation: [], english: [], caseText: [] };
}

function normalizeQuestion(entry) {
  let stem = entry.stem.join('\n').trim();
  if (!stem) return null;
  const response = entry.answer.join('\n').trim();
  const common = { english: entry.english.join(' ').trim(), explanation: entry.explanation.join('\n').trim(), topic: entry.topic };
  if (entry.options.size >= 2) {
    const inline = inlineAnswer.exec(stem);
    const letters = choiceLetters(response || inline?.[1] || '');
    const keys = [...entry.options.keys()].sort();
    const correct = letters.length && letters.every((letter) => entry.options.has(letter))
      && keys.every((key, index) => key === String.fromCharCode(65 + index))
      ? letters.map((letter) => keys.indexOf(letter)) : [];
    if (!response && !correct.length && !entry.type && !entry.explicit &&
        !questionEnding.test(stem) && !/[(（]\s*[)）]/.test(stem)) return null;
    const type = correct.length > 1 || (!correct.length && entry.type === 'multi') ? 'multi' : 'single';
    if (inline && !response && correct.length) stem = stem.slice(0, inline.index).trim();
    const answer = correct.slice().sort((a, b) => a - b).map((i) => String.fromCharCode(65 + i)).join('、');
    return { ...common, type, stem, options: keys.map((k) => ({ zh: entry.options.get(k) })), correct, answer, originalAnswer: correct.length ? '' : response };
  }
  if (entry.options.size || /^(?:single|multi|choice)$/.test(entry.type)) return null;
  const type = entry.type || (/_{2,}|＿{2,}/.test(stem) ? 'fill' : entry.caseText.length ? 'case' : entry.english.length ? 'explain' : 'short');
  if (!response && !entry.explicit && !entry.type && type !== 'fill') return null;
  if (type === 'truefalse') {
    const value = response.replace(/[。！!.\s]/g, '').toLowerCase();
    const answer = /^(正确|对|√|✓|true|t)$/.test(value) ? 'true' : /^(错误|错|×|✗|false|f)$/.test(value) ? 'false' : '';
    return { ...common, type, stem, answer, originalAnswer: answer ? '' : response };
  }
  return { ...common, type, stem, caseText: entry.caseText.join('\n').trim(), answer: response };
}

function detectQuestions(source) {
  const rawLines = source.replace(/^\uFEFF/, '')
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*(?:\x60{3}|~~~)[^\n]*\n[\s\S]*?^[ \t]*(?:\x60{3}|~~~)[^\n]*$/gm, '')
    .split(/\r?\n/);
  const lines = rawLines.map((line) => line.replace(/\*\*/g, '').trim());
  const items = [];
  let topic = '';
  let type = '';
  let item;
  let activeField = '';
  let readingKey = false;
  let batchStart = 0;
  const key = new Map();
  let keyNumber = null;

  function finish() {
    if (item) items.push(item);
    item = null;
    activeField = '';
  }

  function finishKey() {
    if (!readingKey) return;
    const numbered = items.slice(batchStart);
    const counts = new Map();
    for (const entry of numbered) counts.set(entry.n, (counts.get(entry.n) || 0) + 1);
    for (const entry of numbered) {
      if (!entry.answer.some(Boolean) && counts.get(entry.n) === 1 && key.has(entry.n)) entry.answer = key.get(entry.n);
    }
    batchStart = items.length;
    readingKey = false;
    keyNumber = null;
    key.clear();
  }

  function readKey(line) {
    const cells = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (cells) { key.set(cells[1], [cells[2]]); keyNumber = cells[1]; return; }
    const entries = [...line.matchAll(/(?:^|\s+)(\d+)\s*[.．、)）:：]\s*(.*?)(?=\s+\d+\s*[.．、)）:：]|$)/g)];
    if (entries.length) {
      for (const [, n, value] of entries) { key.set(n, [value]); keyNumber = n; }
    } else if (keyNumber && !line.startsWith('|') && !/^---+$/.test(line)) {
      key.get(keyNumber).push(line);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    const label = heading?.[1] || line;
    const nextType = typeOf(label);
    if (answerHeading.test(label) && !(item && !heading && fieldLine.test(line))) {
      finish();
      finishKey();
      readingKey = true;
      continue;
    }
    if (heading || nextType) {
      finish();
      finishKey();
      if (nextType) type = nextType;
      else { type = ''; topic = label; }
      continue;
    }
    if (readingKey) { readKey(line); continue; }
    if (/^[-─]{3,}$/.test(line)) { finish(); continue; }

    const field = fieldLine.exec(line);
    if (field && item) {
      const label = field[1] || field[2];
      activeField = /解析/.test(label) ? 'explanation' : label === '英文' ? 'english'
        : /病例|病史/.test(label) ? 'caseText' : 'answer';
      item[activeField].push(field[3]);
      continue;
    }

    const numbered = questionLine.exec(line);
    const next = lines.slice(i + 1, i + 5).find(Boolean) || '';
    const nextField = fieldLine.exec(next);
    const startsQuestion = numbered && (!item || !activeField || !numbered[1] ||
      (!/^\s{2,}/.test(rawLines[i]) && (optionLine.test(next) ||
        (nextField && /答案|^答$|^英文$/.test(nextField[1] || nextField[2])) || questionEnding.test(numbered[3]))));
    if (startsQuestion) {
      finish();
      const parts = splitOptions(numbered[3]);
      item = newItem(parts.shift(), numbered[1], Boolean(numbered[2]), type, topic);
      for (const part of parts) appendOption(item, part);
      continue;
    }

    if (!item && /^(?:short|explain|case|fill)$/.test(type) && (fieldLine.test(next) || questionEnding.test(line))) {
      item = newItem(line, undefined, false, type, topic);
      continue;
    }
    if (!item) continue;
    if (!activeField && optionLine.test(line)) {
      for (const part of splitOptions(line)) appendOption(item, part);
    } else if (activeField) item[activeField].push(line);
    else if (item.options.size) {
      const last = [...item.options.keys()].pop();
      item.options.set(last, item.options.get(last) + '\n' + line);
    } else item.stem.push(line);
  }
  finish();
  finishKey();
  return items.map(normalizeQuestion).filter(Boolean);
}

module.exports = { detectQuestions };
