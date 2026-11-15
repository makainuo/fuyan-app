/**
 * 消化系统 · 按押题标记重点（本地脚本，不上传）
 *
 * 数据来自桌面《消化押题(1).md》：
 *   main   = 主押（重点）  backup = 备选
 * 写回：<归档>\questions.json（以及 fuyan/data/archives 的旧副本）
 * 额外：补一道“早期胃癌”题（押题补 9）
 *
 * 用法：node tools/apply-exam-focus.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ARCH_ID = 'digestive';
const CANDIDATES = [
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'fuyan', 'archives', ARCH_ID),
  path.resolve('data', 'archives', ARCH_ID),
];

// id: [level, 押题要点]
const FOCUS = {
  // ---- 名词解释 / 简答：主押 ----
  S04: ['main', 'Barrett 食管：远端食管复层鳞状上皮被柱状上皮取代，长期 GERD 相关，属食管腺癌的癌前状态。'],
  S09: ['main', 'UC：主要累及结直肠，连续性分布，病变限于黏膜及黏膜下层，隐窝脓肿。'],
  S10: ['main', 'CD：可累及全消化道，节段性/跳跃性，透壁性炎症 → 瘘管、狭窄、肛周病变。'],
  M05: ['main', 'CD 特点：跳跃性分布、全层受累、非干酪性肉芽肿、瘘管/狭窄/肛周病变。'],
  S16: ['main', '门脉高压三大表现：脾大及脾功能亢进、侧支循环开放、腹水；最危险的侧支是食管胃底静脉。'],
  S17: ['main', 'SAAG ≥ 1.1 g/dL（11 g/L）提示门脉高压性腹水。'],
  M07: ['main', '门脉高压表现：脾大/脾亢、侧支循环（食管胃底、腹壁、直肠）、腹水。'],
  S21: ['main', '疑似食管胃底静脉曲张破裂出血：尽早用降门脉压药（生长抑素/奥曲肽或特利加压素）+ 抑酸。'],
  M09: ['main', '上消化道出血：先复苏、稳定循环，再内镜；曲张出血尽早用药，持续出血评估 TIPS。'],
  S23: ['main', '急性胆囊炎：右上腹痛、Murphy 征阳性、超声胆囊壁增厚。'],
  S24: ['main', 'Charcot 三联征 = 腹痛 + 寒战高热 + 黄疸。'],
  S25: ['main', 'Reynolds 五联征 = Charcot 三联征 + 休克 + 意识改变。'],
  M10: ['main', '胆管炎：Charcot/Reynolds 征、胆管扩张或结石；胆囊炎：Murphy 征、胆囊壁增厚。'],
  S26: ['main', '急性胰腺炎诊断三取二：典型腹痛、淀粉酶/脂肪酶 > 3×正常上限、影像学特征。'],
  S27: ['main', '器官衰竭持续 > 48 小时为 SAP；≤ 48 小时为 MSAP。'],
  S28: ['main', '假性囊肿：病程 > 4 周、无坏死内容；WON：含坏死物、有包膜、> 4 周。'],
  M11: ['main', '四类局部积聚：急性胰周液体积聚 APFC、胰腺假性囊肿、急性坏死性积聚 ANC、包裹性坏死 WON。'],
  S30: ['main', '胆源性急性胰腺炎合并胆管炎：抗感染 + 复苏 + 及时 ERCP 胆道减压。'],
  S31: ['main', '急性阑尾炎：转移性右下腹痛、麦氏点压痛。'],
  S33: ['main', '绞窄性肠梗阻：持续剧痛、腹膜刺激征、肠壁低强化。'],
  S38: ['main', '胃癌转移至卵巢形成的肿瘤称 Krukenberg 瘤。'],
  S39: ['main', 'TNM 的 T3：肿瘤穿透肌层达浆膜下，未累及脏层腹膜。'],

  // ---- 备选 / 细节 ----
  S05: ['backup', ''],
  S06: ['backup', ''],
  S07: ['backup', ''],
  M02: ['backup', '消化性溃疡四大并发症：出血、穿孔、梗阻、癌变。'],
  S08: ['backup', 'Hp 根除后复查 UBT：停药（含 PPI）至少 4 周。'],
  M03: ['backup', '铋剂四联 = PPI + 铋剂 + 两种抗生素，疗程 10–14 天。'],
  S18: ['backup', ''],
  S19: ['backup', ''],
  M08: ['backup', ''],
  S20: ['backup', '上消化道出血：屈氏韧带以上（食管、胃、十二指肠、胰胆及胃空肠吻合口）。'],
  S22: ['backup', ''],
  S46: ['backup', ''],
  S32: ['backup', ''],
  M12: ['backup', ''],
  M13: ['backup', ''],
  M14: ['backup', ''],
  M15: ['backup', ''],
  M04: ['backup', ''],
  M06: ['backup', ''],
  S40: ['backup', ''],
};

const NEW_Q = {
  id: 'S47',
  type: 'single',
  topic: '肿瘤',
  tags: ['备选', '名解相关'],
  hot: 'backup',
  src: '',
  stem: '早期胃癌的定义是（　）',
  stemEn: 'Early gastric cancer is defined as（　）',
  options: [
    { zh: '癌组织局限于黏膜或黏膜下层，不论有无淋巴结转移', en: 'Carcinoma limited to mucosa or submucosa, regardless of lymph node metastasis' },
    { zh: '癌组织局限于黏膜层，且无淋巴结转移', en: 'Carcinoma limited to mucosa without lymph node metastasis' },
    { zh: '癌灶直径小于 2 cm', en: 'Tumor diameter less than 2 cm' },
    { zh: '无远处转移的胃癌', en: 'Gastric cancer without distant metastasis' },
    { zh: '仅累及胃窦部的胃癌', en: 'Gastric cancer involving the antrum only' },
  ],
  answer: [0],
  answerText: null,
  explain:
    '早期胃癌指癌组织限于黏膜或黏膜下层，不论有无淋巴结转移；与病灶大小、部位无关。进展期胃癌指癌组织已侵入肌层或更深。',
  examNote: '押题补 9：早期胃癌常与“局限于黏膜层”混淆——判据是深度（黏膜/黏膜下层），不是大小，也不看淋巴结。',
  raw: null,
};

function apply(dir) {
  const file = path.join(dir, 'questions.json');
  if (!fs.existsSync(file)) {
    console.log('skip (missing):', file);
    return;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const list = data.questions || [];

  fs.writeFileSync(file + '.bak-' + new Date().toISOString().slice(0, 10), raw, 'utf8');

  let touched = 0;
  for (const q of list) {
    const f = FOCUS[q.id];
    if (!f) continue;
    const [level, note] = f;
    q.hot = level;
    const tags = new Set(q.tags || []);
    tags.add(level === 'main' ? '重点' : '备选');
    q.tags = [...tags];
    if (note) q.examNote = note;
    touched++;
  }

  if (!list.some((q) => q.id === NEW_Q.id)) {
    list.push({ ...NEW_Q });
  } else {
    const i = list.findIndex((q) => q.id === NEW_Q.id);
    list[i] = { ...list[i], ...NEW_Q };
  }

  data.questions = list;
  data.count = list.length;
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n', 'utf8');
  console.log(`updated ${file}: ${touched} marked, total ${list.length}`);

  // manifest 里的题量与标签
  const mfile = path.join(dir, 'manifest.json');
  if (fs.existsSync(mfile)) {
    const m = JSON.parse(fs.readFileSync(mfile, 'utf8'));
    m.quiz = m.quiz || {};
    m.quiz.total = list.length;
    const tags = new Set(m.quiz.tags || []);
    tags.add('重点');
    tags.add('备选');
    m.quiz.tags = [...tags];
    fs.writeFileSync(mfile, JSON.stringify(m, null, 1) + '\n', 'utf8');
    console.log('updated manifest quiz.total =', list.length);
  }
}

for (const dir of CANDIDATES) apply(dir);
