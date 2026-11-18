'use strict';

function asText(value) {
  return Array.isArray(value) ? value.map(asText).join('\n') : String(value ?? '').trim();
}

const join = (...parts) => parts.map(asText).filter(Boolean).join(' · ');
const heading = (value) => ({ type: 'heading', text: asText(value) });
const paragraph = (value) => ({ type: 'paragraph', text: asText(value) });
const list = (items) => ({ type: 'list', items: items.map(asText).filter(Boolean) });
const table = (headers, rows) => ({ type: 'table', headers: headers.map(asText), rows: rows.map((row) => row.map(asText)) });

function embeddedStudyData(html) {
  const script = /<script\b(?=[^>]*\bid=["']study-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (!script) return null;
  const data = JSON.parse(script[1]);
  if (!data || !['notes', 'quiz', 'terms', 'shorts', 'cases'].every((key) => Array.isArray(data[key]))) return null;

  const topics = new Map(data.notes.map((note) => [note.id, note.title]));
  const topic = (id) => topics.get(id) || asText(id);
  const notes = data.notes.map((note) => ({
    title: note.title,
    blocks: [
      ...(note.summary ? [paragraph(note.summary)] : []),
      ...(note.blocks || []).flatMap(([name, items]) => [heading(name), list(items)]),
      ...(note.tables || []).flatMap(([name, headers, rows]) => [heading(name), table(headers, rows)]),
      ...(note.trap ? [heading('复习提示'), paragraph(note.trap)] : []),
      ...(note.source ? [heading('讲义来源'), paragraph(note.source)] : []),
    ].filter((block) => block.type !== 'list' || block.items.length),
  }));
  const references = [];
  if (data.refs?.length) references.push(heading('参考文献'), table(['资料', '链接', '用途'], data.refs));
  if (data.handoutSources?.length) references.push(heading('讲义索引'), table(['文件', '内容', '位置'], data.handoutSources));
  if (data.predictionFiles?.length) references.push(heading('押题来源'), list(data.predictionFiles));
  if (data.answerVerification?.length) references.push(heading('补配答案核对'), table(['文件', '题号', '答案', '依据'], data.answerVerification));
  if (references.length) notes.push({ title: '资料来源与答案核对', blocks: references });

  const single = [];
  const multi = [];
  for (const [id, stem, options, correct, explanation, reference, metadata] of data.quiz) {
    const meta = metadata || {};
    const isMulti = Array.isArray(correct);
    const letter = (n) => Number.isInteger(n) && n >= 0 && n < options.length ? String.fromCharCode(65 + n) : '';
    const answer = isMulti ? correct.map(letter) : letter(correct);
    (isMulti ? multi : single).push({
      stem, options, answer, explanation: asText(explanation), topic: meta.topicLabel || topic(id),
      source: join(meta.bank, meta.originalId, meta.file, meta.year ? meta.year + '年' : '', meta.answerOrigin, reference),
    });
  }
  const explain = data.terms.map(([id, , english, stem, answer, source]) => ({
    stem: stem || english, english, answer: asText(answer), topic: topic(id), source: asText(source),
  }));
  const short = data.shorts.map(([id, , english, stem, answer, source], index) => ({
    stem, english, answer: [asText(answer), ...(data.shortTables?.[index] || []).map(([title, headers, rows]) => title + '\n' +
      rows.map((row) => row.map((cell, i) => headers[i] + '：' + asText(cell)).join('；')).join('\n'))].join('\n\n'),
    topic: topic(id), source: asText(source),
  }));
  const caseLabels = ['最可能的诊断', '诊断依据', '进一步检查', '鉴别诊断', '治疗原则'];
  const cases = data.cases.map(([id, , stem, caseText, parts, explanation, source]) => ({
    stem, caseText, answer: parts.map((text, i) => (caseLabels[i] || '答题要点') + '\n' + asText(text)).join('\n\n'),
    explanation: asText(explanation), topic: topic(id), source: asText(source),
  }));
  return {
    notes,
    sections: [
      { type: 'single', questions: single }, { type: 'multi', questions: multi }, { type: 'explain', questions: explain },
      { type: 'short', questions: short }, { type: 'case', questions: cases },
    ],
  };
}

function decodeHtml(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, en) => {
    if (!en.startsWith('#')) return entities[en.toLowerCase()] || match;
    const hex = en[1].toLowerCase() === 'x';
    const n = Number.parseInt(en.slice(hex ? 2 : 1), hex ? 16 : 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
  });
}

function readHtml(html) {
  const title = decodeHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
  const study = embeddedStudyData(html);
  if (study) return { title, study };
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1] || html;
  const markdown = decodeHtml(body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol\s*>/gi, (_, items) => {
      let index = 0;
      return items.replace(/<li\b[^>]*>/gi, () => '\n' + (++index) + '. ');
    })
    .replace(/<h([1-6])\b[^>]*>/gi, (_, level) => '\n' + '#'.repeat(Number(level)) + ' ')
    .replace(/<\/tr\s*>/gi, ' |\n')
    .replace(/<(?:th|td)\b[^>]*>/gi, '| ')
    .replace(/<(?:p|div|section|article|pre)\b[^>]*>/gi, '\n')
    .replace(/<br\b[^>]*>|<\/(?:h[1-6]|p|div|li|section|article|dd|dt|pre)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .split('\n').map((line) => line.trim()).filter(Boolean).join('\n\n');
  return { title, markdown };
}

module.exports = { readHtml };
