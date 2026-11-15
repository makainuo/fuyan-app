/**
 * 消化系统 · 按《消化押题》优化主观题部分（名解 / 简答 / 病例）
 *
 * - 名解：5 个主押 + 5 个备选（含新补“绞窄性肠梗阻”“早期胃癌”两张卡），加押题筛选
 * - 简答：6 道主押 + 3 道备选，题目标“押题·主/备”
 * - 病例：CASE 01/02/04 主押；90 秒快诊 阑尾炎 / 肠梗阻 备选
 * - 每个部分顶部加一条“押题优先”清单
 *
 * 用法：node tools/apply-subjective-focus.mjs
 * 只写本地存档（%APPDATA%）和 fuyan/data 里的旧副本，不联网。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ARCH = 'digestive';
const FILES = [
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'fuyan', 'archives', ARCH, 'content.html'),
  path.resolve('data', 'archives', ARCH, 'content.html'),
];

const FLASH_MAIN = [
  'Barrett esophagus',
  'Crohn’s disease',
  'Portal hypertension',
  'Charcot triad',
  'Acute pancreatitis',
];
const FLASH_BACKUP = [
  'Reynolds pentad',
  'Upper gastrointestinal bleeding',
  'TNM staging',
];

const SHORT_MAIN = ['Q4', 'Q6', 'Q7', 'Q9', 'Q11', 'Q12'];
const SHORT_BACKUP = ['Q2', 'Q3', 'Q8'];

const NEW_CARDS = `
        <button class="flashcard" data-tag="m5" data-exam="backup" type="button" aria-pressed="false">
          <span class="flash-inner">
            <span class="flash-face flash-front"><small>押题补充 · M5</small><strong>Strangulated intestinal obstruction</strong><em>strangulated obstruction</em><span class="flip-hint"><span>绞窄性肠梗阻</span><span>点击翻面</span></span></span>
            <span class="flash-face flash-back"><b>绞窄性肠梗阻</b><span class="flash-def">肠管血运障碍的肠梗阻，常见于嵌顿疝、肠扭转、粘连束带压迫。表现为持续剧烈腹痛、腹膜刺激征、肠鸣音减弱或消失，可迅速出现休克；应急诊手术，不宜保守观察。</span><span class="back-en">strangulated intestinal obstruction</span></span>
          </span>
        </button>
        <button class="flashcard" data-tag="m7" data-exam="backup" type="button" aria-pressed="false">
          <span class="flash-inner">
            <span class="flash-face flash-front"><small>押题补充 · M7</small><strong>Early gastric cancer</strong><em>early gastric carcinoma</em><span class="flip-hint"><span>早期胃癌</span><span>点击翻面</span></span></span>
            <span class="flash-face flash-back"><b>早期胃癌</b><span class="flash-def">癌组织局限于黏膜或黏膜下层，不论有无淋巴结转移；与病灶大小、部位无关。若已侵及肌层或更深即为进展期胃癌。</span><span class="back-en">early gastric cancer</span></span>
          </span>
        </button>
`;

function markFlashcards(s) {
  let count = 0;
  const apply = (term, level) => {
    const re = new RegExp('<button class="flashcard"([^>]*)>(?:(?!</button>)[\\s\\S])*?<strong>' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</strong>');
    s = s.replace(re, (m, attrs) => {
      if (/data-exam=/.test(attrs)) return m;
      count++;
      return `<button class="flashcard"${attrs} data-exam="${level}">` + m.slice(`<button class="flashcard"${attrs}>`.length);
    });
  };
  FLASH_MAIN.forEach((t) => apply(t, 'main'));
  FLASH_BACKUP.forEach((t) => apply(t, 'backup'));
  return { s, count };
}

function markShorts(s) {
  let count = 0;
  const apply = (q, level) => {
    const sumStart = s.indexOf(`<summary>${q}　`);
    if (sumStart < 0) {
      console.log('  ! short not found', q);
      return;
    }
    const sumEnd = s.indexOf('</summary>', sumStart);
    const summary = s.slice(sumStart, sumEnd);
    if (summary.includes('tag exam')) return;
    const label = level === 'main' ? '押题·主' : '押题·备';
    s = s.slice(0, sumEnd) + `<span class="tag exam${level === 'backup' ? ' exam-b' : ''}">${label}</span>` + s.slice(sumEnd);
    const det = s.lastIndexOf('<details', sumStart);
    if (det >= 0 && !s.slice(det, det + 60).includes('data-exam')) {
      s = s.slice(0, det) + `<details data-exam="${level}"` + s.slice(det + '<details'.length);
    }
    count++;
  };
  SHORT_MAIN.forEach((q) => apply(q, 'main'));
  SHORT_BACKUP.forEach((q) => apply(q, 'backup'));
  return { s, count };
}

function markCases(s) {
  let count = 0;
  const cases = [
    ['case1', 'main', '优先抢救'],
    ['case2', 'main', 'Reynolds 五联征'],
    ['case4', 'main', 'SAP + 坏死'],
  ];
  for (const [id, level, oldTag] of cases) {
    const i = s.indexOf(`id="${id}"`);
    if (i < 0) continue;
    const tagStr = `<span class="tag red case-tag">${oldTag}</span>`;
    const j = s.indexOf(tagStr, i);
    if (j < 0) continue;
    s = s.slice(0, j) + `<span class="tag exam case-tag">押题·主</span>` + s.slice(j);
    count++;
  }
  for (const [name, level] of [['阑尾炎', 'backup'], ['肠梗阻', 'backup']]) {
    const needle = `<div class="mini-case"><b>90 秒快诊 · ${name}</b>`;
    const k = s.indexOf(needle);
    if (k < 0) continue;
    const label = level === 'main' ? '押题·主' : '押题·备';
    s = s.replace(needle, `<div class="mini-case" data-exam="${level}"><b>90 秒快诊 · ${name}</b><span class="tag exam exam-b">${label}</span>`);
    count++;
  }
  return { s, count };
}

const BANNERS = {
  naming: `<div class="note exam-note"><b>押题优先（名词解释）：</b>Barrett 食管、克罗恩病、门静脉高压、Charcot 三联征、急性胰腺炎；备选：Reynolds 五联征、上消化道出血、绞窄性肠梗阻、早期胃癌、TNM 分期。点下面「押题」只看这 10 张。</div>
      `,
  shorts: `<div class="note exam-note"><b>押题优先（简答）：</b>Q4 UC 与 CD 鉴别、Q6 门脉高压、Q7 腹水、Q9 胆囊炎与胆管炎、Q11 胰腺炎诊断与分级、Q12 局部并发症；备选：Q8 上消化道出血、Q3 Hp 根除、Q2 消化性溃疡并发症。</div>
      `,
  cases: `<div class="note exam-note"><b>押题优先（病例）：</b>CASE 01 肝硬化合并上消化道出血、CASE 02 急性重症胆管炎、CASE 04 重症胰腺炎；备选：90 秒快诊 阑尾炎 / 肠梗阻。答题按「诊断 → 依据 → 进一步检查 → 鉴别 → 治疗」五栏写。</div>
      `,
};

function apply(file) {
  if (!fs.existsSync(file)) {
    console.log('skip (missing):', file);
    return;
  }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('data-exam="main"') && s.includes('exam-note')) {
    console.log('already applied:', file);
    return;
  }
  fs.writeFileSync(file + '.bak-subjective', s, 'utf8');

  let r = markFlashcards(s);
  s = r.s;
  console.log('flashcards marked:', r.count);

  // 新补两张卡（只加一次）
  if (!s.includes('Strangulated intestinal obstruction')) {
    const marker = '      </div>\n    </section>\n\n\n    <!-- ================= SHORTS';
    if (s.includes(marker)) {
      s = s.replace(marker, NEW_CARDS + marker);
      console.log('flashcards added: 2');
    } else {
      console.log('! flashgrid marker not found, skip new cards');
    }
    s = s.replace(`<span id="flashVisible">44</span> / 44 张`, `<span id="flashVisible">46</span> / 46 张`);
  }

  // 名解筛选：加「押题」按钮
  if (!s.includes('data-filter="exam"')) {
    s = s.replace(
      `<button class="filter-btn active" data-filter="all" type="button" data-act="filter-flash" data-target="#flashGrid">全部</button>`,
      `<button class="filter-btn active" data-filter="all" type="button" data-act="filter-flash" data-target="#flashGrid">全部</button>
          <button class="filter-btn" data-filter="exam" type="button" data-act="filter-flash" data-target="#flashGrid">押题</button>`
    );
  }

  r = markShorts(s);
  s = r.s;
  console.log('shorts marked:', r.count);

  r = markCases(s);
  s = r.s;
  console.log('cases marked:', r.count);

  // 顶部押题清单
  if (!s.includes('exam-note')) {
    s = s.replace('<div class="flash-toolbar">', BANNERS.naming + '<div class="flash-toolbar">');
    s = s.replace(
      '<div class="note"><b>使用方式：</b>简答题不要背成段落',
      BANNERS.shorts + '<div class="note"><b>使用方式：</b>简答题不要背成段落'
    );
    const casesHeadEnd = s.indexOf('<div class="case-list"');
    if (casesHeadEnd > 0) s = s.slice(0, casesHeadEnd) + BANNERS.cases + '      ' + s.slice(casesHeadEnd);
    console.log('banners inserted');
  }

  fs.writeFileSync(file, s, 'utf8');
  console.log('written:', file, s.length);
}

for (const f of FILES) apply(f);

// manifest：名解数量 44 → 46
for (const f of FILES) {
  const mf = path.join(path.dirname(f), 'manifest.json');
  if (!fs.existsSync(mf)) continue;
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  let changed = false;
  for (const n of m.nav || []) {
    if (n.sectionId === 'naming' && n.count === 44) {
      n.count = 46;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(mf, JSON.stringify(m, null, 1) + '\n', 'utf8');
    console.log('manifest naming count -> 46:', mf);
  }
}
