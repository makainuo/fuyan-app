import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  'C:/Users/29866/AppData/Roaming/fuyan/archives/digestive/content.html',
  'D:/学习资料/_复习站App/fuyan/data/archives/digestive/content.html',
];

const CARDS = [
  {
    tag: 'm5',
    term: 'Strangulated intestinal obstruction',
    en: 'strangulated obstruction',
    zh: '绞窄性肠梗阻',
    def: '肠管血运障碍的肠梗阻，常见于嵌顿疝、肠扭转、粘连束带压迫。表现为持续剧烈腹痛、腹膜刺激征、肠鸣音减弱或消失，可迅速出现休克；应急诊手术，不宜保守观察。',
  },
  {
    tag: 'm7',
    term: 'Early gastric cancer',
    en: 'early gastric carcinoma',
    zh: '早期胃癌',
    def: '癌组织局限于黏膜或黏膜下层，不论有无淋巴结转移；与病灶大小、部位无关。若已侵及肌层或更深即为进展期胃癌。',
  },
];

const block = CARDS.map(
  (c) => `        <button class="flashcard" data-tag="${c.tag}" data-exam="backup" type="button" aria-pressed="false">
          <span class="flash-inner">
            <span class="flash-face flash-front"><small>押题补充 · ${c.tag.toUpperCase()}</small><strong>${c.term}</strong><em>${c.en}</em><span class="flip-hint"><span>${c.zh}</span><span>点击翻面</span></span></span>
            <span class="flash-face flash-back"><b>${c.zh}</b><span class="flash-def">${c.def}</span><span class="back-en">${c.en}</span></span>
          </span>
        </button>
`
).join('').replace(/\n/g, '\r\n');

for (const f of FILES) {
  if (!fs.existsSync(f)) {
    console.log('skip', f);
    continue;
  }
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('Strangulated intestinal obstruction')) {
    console.log('already has cards:', f);
    continue;
  }
  const marker = '      </div>\r\n    </section>\r\n\r\n\r\n    <!-- ================= SHORTS';
  if (!s.includes(marker)) {
    console.log('marker missing:', f);
    continue;
  }
  s = s.replace(marker, block + marker);
  fs.writeFileSync(f, s, 'utf8');
  const n = (s.match(/class="flashcard"/g) || []).length;
  console.log('added cards:', f, 'flashcards now', n);
}
