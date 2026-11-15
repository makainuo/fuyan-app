/**
 * 消化存档：在「英文缩写」后新增「词根精选」板块（考前冲刺）
 * 数据来源：桌面《医学英语词根_消化系统课件.html》+ 正文高频中文概念
 * 用法：node tools/add-roots-section.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const FILES = [
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'fuyan', 'archives', 'digestive', 'content.html'),
  path.resolve('data', 'archives', 'digestive', 'content.html'),
];
const MANIFESTS = FILES.map((f) => path.join(path.dirname(f), 'manifest.json'));

const row = (root, meaning, words) => `            <tr><td>${root}</td><td>${meaning}</td><td>${words}</td></tr>`;

const groups = [
  {
    title: '01 · 器官部位：先定位',
    note: '看到长词先找“部位词根”，再读后面的病变或手术后缀。',
    head: ['词根', '含义', '高频例词'],
    rows: [
      ['gastr/o', '胃', 'gastritis 胃炎 · gastrectomy 胃切除术 · epigastric 上腹部的'],
      ['esophag/o（oesophag/o）', '食管', 'esophagitis 食管炎 · esophagogastroduodenoscopy 食管胃十二指肠镜'],
      ['enter/o', '小肠 / 肠', 'enteroscopy 小肠镜 · gastroenterology 胃肠病学'],
      ['duoden/o', '十二指肠', 'duodenal ulcer 十二指肠溃疡 · gastroduodenal 胃十二指肠的'],
      ['jejun/o', '空肠', 'gastrojejunostomy 胃空肠吻合术'],
      ['ile/o', '回肠', 'ileitis 回肠炎 · ileum 回肠（≠ ilium 髂骨）'],
      ['col/o / colon/o', '结肠', 'colitis 结肠炎 · colonoscopy 结肠镜'],
      ['rect/o', '直肠', 'colorectal 结直肠的 · rectum 直肠'],
      ['proct/o / an/o', '肛直肠 / 肛门', 'proctoscopy 直肠镜 · transanal 经肛门的'],
      ['appendic/o', '阑尾', 'appendicitis 阑尾炎 · appendectomy 阑尾切除术'],
      ['hepat/o', '肝', 'hepatitis 肝炎 · hepatocellular 肝细胞的'],
      ['chol/e', '胆 / 胆汁', 'cholelithiasis 胆石症 · cholestasis 胆汁淤积'],
      ['cholecyst/o', '胆囊', 'cholecystitis 胆囊炎 · cholecystectomy 胆囊切除术'],
      ['cholangi/o', '胆管', 'cholangitis 胆管炎 · cholangiocarcinoma 胆管癌'],
      ['pancreat/o', '胰', 'pancreatitis 胰腺炎 · pancreatic 胰腺的'],
      ['peritone/o', '腹膜', 'peritonitis 腹膜炎 · peritoneal 腹膜的'],
      ['port/o', '门静脉', 'portosystemic 门体分流的 · portal hypertension 门脉高压'],
    ],
  },
  {
    title: '02 · 病变后缀：看“发生了什么”',
    note: '后缀只能提示病变类别，不能替代诊断标准；-itis 不等于一定细菌感染。',
    head: ['后缀', '含义', '高频例词'],
    rows: [
      ['-itis', '炎症', 'gastritis 胃炎 · hepatitis 肝炎 · pancreatitis 胰腺炎 · peritonitis 腹膜炎'],
      ['-osis', '异常状态', 'cirrhosis 肝硬化 · necrosis 坏死 · stenosis 狭窄'],
      ['-iasis', '病态 / 结石形成', 'cholelithiasis 胆石症 · cholecystolithiasis 胆囊结石症'],
      ['-oma', '肿块 / 肿瘤', 'carcinoma 癌 · angioma 血管瘤 · hematoma 血肿（不是肿瘤）'],
      ['-pathy', '病变', 'encephalopathy 脑病 · lymphadenopathy 淋巴结病'],
      ['-megaly', '增大', 'splenomegaly 脾大 · hepatomegaly 肝大'],
      ['-plasia', '增生 / 发育', 'dysplasia 异型增生 · metaplasia 化生 · hyperplasia 增生'],
      ['-stenosis', '狭窄', 'stenosis 狭窄 · esophageal stricture 食管狭窄'],
      ['-rrhagia', '大量流出 / 出血', 'hemorrhage 出血'],
      ['-stasis', '停滞', 'cholestasis 胆汁淤积 · metastasis 转移'],
      ['-trophy', '营养 / 生长', 'hypertrophic 肥厚的 · atrophy 萎缩'],
    ],
  },
  {
    title: '03 · 症状词根：病史和主诉里最高频',
    note: '先分清“困难”还是“痛”，再分清“出血”还是“流/泻”。',
    head: ['词根', '含义', '高频例词'],
    rows: [
      ['-phagia', '吞咽', 'dysphagia 吞咽困难 · odynophagia 吞咽痛'],
      ['odyn/o', '痛', 'odynophagia 吞咽痛 · gastralgia 胃痛'],
      ['-emesis', '呕吐', 'hematemesis 呕血 · vomiting 呕吐'],
      ['-rrhea', '流 / 排出', 'diarrhea 腹泻 · steatorrhea 脂肪泻'],
      ['hemat/o', '血', 'hematemesis 呕血 · hematochezia 便血'],
      ['lith/o', '石', 'cholelithiasis 胆石症 · lithotripsy 碎石术'],
      ['steat/o', '脂肪', 'steatorrhea 脂肪泻'],
      ['melan-', '黑', 'melena 黑便（词源联想法，临床词义整体记）'],
    ],
  },
  {
    title: '04 · 检查与治疗：手术词尾别混',
    note: '看结尾判断“检查 / 切除 / 切开 / 造口 / 吻合”，比死记长词快。',
    head: ['后缀', '含义', '高频例词'],
    rows: [
      ['-scopy', '镜下检查', 'gastroscopy 胃镜 · colonoscopy 结肠镜 · laparoscopy 腹腔镜'],
      ['-graphy', '造影 / 成像', 'cholangiopancreatography 胆胰管造影 · ultrasonography 超声检查'],
      ['-ectomy', '切除术', 'gastrectomy 胃切除 · cholecystectomy 胆囊切除 · mucosectomy 黏膜切除'],
      ['-tomy / -otomy', '切开 / 切断', 'vagotomy 迷走神经切断 · laparotomy 开腹术'],
      ['-stomy / -ostomy', '造口 / 吻合口', 'colostomy 结肠造口 · gastrojejunostomy 胃空肠吻合'],
      ['-plasty', '成形 / 修复', 'pyloroplasty 幽门成形术'],
      ['-tripsy', '碎石', 'lithotripsy 碎石术'],
      ['-opsy', '观察 / 取材', 'biopsy 活检（不要拆成 bi=二）'],
      ['-logy', '学科', 'gastroenterology 胃肠病学 · hepatology 肝病学'],
    ],
  },
  {
    title: '05 · 位置与程度：读影像和手术记录用',
    note: 'peri- 周、epi- 上、intra- 内、inter- 之间，最容易混。',
    head: ['前缀', '含义', '高频例词'],
    rows: [
      ['endo-', '内 / 内部', 'endoscopy 内镜 · endoscopic 内镜的'],
      ['epi-', '上 / 之上', 'epigastric 上腹部的'],
      ['peri-', '周围', 'perigastric 胃周的 · peripancreatic 胰周的'],
      ['sub-', '下 / 之下', 'submucosal 黏膜下的 · subphrenic 膈下的'],
      ['intra-', '内部', 'intrahepatic 肝内的'],
      ['extra-', '外部', 'extrahepatic 肝外的'],
      ['inter-', '之间', 'interloop 肠袢间的'],
      ['trans-', '穿过 / 经', 'transhepatic 经肝的 · transjugular 经颈静脉的 · transanal 经肛门的'],
      ['retro-', '后', 'retrograde 逆行的 · retropancreatic 胰后的'],
      ['hyper-', '过高 / 过多', 'hypertension 高压 · hypersensitivity 高敏感'],
      ['hypo-', '过低 / 不足', 'hypoalbuminemia 低白蛋白血症'],
      ['dys-', '困难 / 异常', 'dysphagia 吞咽困难 · dyspepsia 消化不良'],
      ['anti-', '抗 / 对抗', 'anti-inflammatory 抗炎的 · anti-reflux 抗反流的'],
      ['pseudo-', '假性', 'pseudocyst 假性囊肿'],
    ],
  },
  {
    title: '06 · 高频整词：不靠词根猜，直接背',
    note: '这些词在中文材料里反复出现，但英文全称表里没有；考试遇到就靠整体记忆。',
    head: ['英文', '中文', '一句话记忆'],
    rows: [
      ['cirrhosis', '肝硬化', '组织学诊断；不要只凭 -osis 推'],
      ['ascites', '腹水', '门脉高压最常见并发症之一'],
      ['jaundice', '黄疸', '胆红素升高；与 icterus 对应'],
      ['melena', '黑便', '上消化道出血的典型表现'],
      ['hematemesis', '呕血', '出血量大、速度快时出现'],
      ['hematochezia', '便血', '下消化道出血或上消化道大出血'],
      ['dyspepsia', '消化不良', '功能性胃肠病常用词'],
      ['nausea / vomiting', '恶心 / 呕吐', '症状词，不作为诊断'],
      ['hernia', '疝', '嵌顿 incarceration、绞窄 strangulation'],
      ['incarceration', '嵌顿', '不能回纳，不等于已坏死'],
      ['strangulation', '绞窄', '血运障碍，急诊手术'],
      ['obstruction', '梗阻', '机械性 / 麻痹性；病因需另找'],
      ['ileus', '肠梗阻 / 肠麻痹', 'paralytic ileus 麻痹性肠梗阻'],
      ['fistula', '瘘', '与造口、吻合口区分'],
      ['resection', '切除', '可与 -ectomy 对照'],
      ['anastomosis', '吻合', '不要见 stoma 就当造口'],
      ['abscess', '脓肿', '整体记，不硬拆'],
      ['pseudocyst', '假性囊肿', '胰腺炎局部并发症'],
      ['metastasis', '转移', 'TNM 的 M；-stasis 在这里不是停滞'],
      ['dysplasia', '异型增生', '癌前病变，不等于癌'],
      ['metaplasia', '化生', '如 Barrett 食管的柱状上皮化生'],
      ['carcinoma', '癌', '-oma 不保证良性'],
    ],
  },
  {
    title: '07 · 最容易拆错的地方',
    note: '考前只看这一张也值：这些是选择题最爱设的坑。',
    head: ['对比', '区别', '记忆边界'],
    rows: [
      ['cholecystitis / cholangitis', '胆囊炎 / 胆管炎', 'cyst 是囊，cholang 是胆管'],
      ['dysphagia / odynophagia', '吞咽困难 / 吞咽痛', 'dys=困难；odyno=痛'],
      ['ileum / ilium / ileus', '回肠 / 髂骨 / 肠梗阻', '拼写像，解剖完全不同'],
      ['peri- / epi-', '周围 / 上方', 'perigastric 胃周；epigastric 上腹'],
      ['intra- / inter-', '内部 / 之间', 'intrahepatic 肝内；interloop 肠袢间'],
      ['-ectomy / -tomy / -stomy', '切除 / 切开 / 造口吻合', '看词尾判断术式'],
      ['-itis / -osis / -iasis', '炎症 / 状态 / 结石形成', '不要见后缀就推细菌感染'],
      ['peritoneum / perineum', '腹膜 / 会阴', '拼写近，部位完全不同'],
      ['anemia / hematemesis / melena', '贫血 / 呕血 / 黑便', '一个血液状态，两个临床表现'],
      ['biopsy / bi-', '活检 / 数字二', 'biopsy 来自 bio+opsy'],
    ],
  },
];

const table = (g) => `      <h3>${g.title}</h3>
      <div class="table-wrap">
        <table class="root-table">
          <thead><tr>${g.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>
${g.rows.map((r) => row(r[0], r[1], r[2])).join('\n')}
          </tbody>
        </table>
      </div>`;

const section = `    <section id="roots">
      <div class="block-head">
        <div>
          <p class="eyebrow">Root sprint</p>
          <h2>词根精选：考前最后一遍</h2>
        </div>
        <p>只挑消化系统里频率最高、最能拆开长词的构词成分：先认部位，再认病变，再看症状、检查和位置。最后一张是中文材料里常提、但英文全称表没有的整词。</p>
      </div>
      <div class="note"><b>怎么用：</b>遮住中文，先看词根能否说出“部位/病变”，再看例词能否读回中文；整词表不要拆，直接背。词根只帮助记忆，不能替代诊断标准。</div>
${groups.map(table).join('\n')}
      <div class="note"><b>最后提醒：</b>考试里英文多以“名解 + 选择题”出现。名解先写中文定义，再补英文全称；选择题看到长词先拆部位和后缀，再回到题干限定词（急/慢、上/下、有无并发症）。</div>
    </section>

`;

const CSS = `
    .root-table td:first-child{font-family:var(--mono);font-weight:600;color:var(--accent);white-space:nowrap}
    .root-table td:nth-child(2){white-space:nowrap;color:var(--ink)}
    .root-table td:nth-child(3){font-size:13px;line-height:1.65}
    .root-table tr:hover td{background:color-mix(in srgb,var(--accent) 6%,transparent)}
`;

function apply(file) {
  if (!fs.existsSync(file)) {
    console.log('skip missing', file);
    return;
  }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('id="roots"')) {
    console.log('already has roots:', file);
    return;
  }
  fs.writeFileSync(file + '.bak-roots', s, 'utf8');

  // 1) CSS 追加到第一个 </style>
  const styleEnd = s.indexOf('</style>');
  if (styleEnd > 0) s = s.slice(0, styleEnd) + CSS + s.slice(styleEnd);

  // 2) 插到 <footer> 前
  const foot = s.indexOf('<footer>');
  if (foot < 0) {
    console.log('no footer, abort', file);
    return;
  }
  s = s.slice(0, foot) + section + s.slice(foot);

  // 3) 页脚版本号
  s = s.replace('消化系统 · 复习综合站</b> · v2.0 · 2026-11-14', '消化系统 · 复习综合站</b> · v2.2 · 2026-11-16');

  fs.writeFileSync(file, s, 'utf8');
  console.log('roots section added:', file);
}

for (const f of FILES) apply(f);

// manifest：nav + 版本
for (const mf of MANIFESTS) {
  if (!fs.existsSync(mf)) continue;
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m.version = '2.2.0';
  m.builtAt = '2026-11-16T00:00:00+0800';
  m.nav = m.nav || [];
  if (!m.nav.some((n) => n.sectionId === 'roots')) {
    const idx = m.nav.findIndex((n) => n.sectionId === 'abbreviations');
    const item = { anchor: 'roots', title: '词根精选', badge: 'B', sectionId: 'roots', count: groups.reduce((a, g) => a + g.rows.length, 0) };
    if (idx >= 0) m.nav.splice(idx + 1, 0, item);
    else m.nav.push(item);
  }
  fs.writeFileSync(mf, JSON.stringify(m, null, 1) + '\n', 'utf8');
  console.log('manifest updated', mf, 'version', m.version, 'roots count', (m.nav.find((n) => n.sectionId === 'roots') || {}).count);
}
