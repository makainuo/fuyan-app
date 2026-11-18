'use strict';

/**
 * 文档 → 存档（零依赖，用 Node 自带的 zlib）
 * 支持 Word、PPT、Markdown、纯文本、HTML 和结构化 JSON
 *
 * 产出：<DATA_DIR>/converted/<id>/ + <id>.zip
 * 然后调用 archive.importArchive 放进存档库。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const store = require('./store');
const archiveLib = require('./archive');
const { parseReviewJson, buildDetectedReview, renderReview, renderWorkspace } = require('./review');
const { detectQuestions } = require('./detect-questions');
const { readHtml } = require('./html-import');

/* ---------------------------------------------------------------- ZIP 读 */

function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip / docx / pptx 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    entries.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  function read(name) {
    const e = entries.get(name);
    if (!e) return null;
    const lh = e.localOff;
    if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('压缩包结构损坏');
    const nameLen = buf.readUInt16LE(lh + 26);
    const extraLen = buf.readUInt16LE(lh + 28);
    const start = lh + 30 + nameLen + extraLen;
    const data = buf.slice(start, start + e.compSize);
    if (e.method === 0) return Buffer.from(data);
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw new Error('不支持的 zip 压缩方式：' + e.method);
  }
  return { names: [...entries.keys()], read };
}

/* ---------------------------------------------------------------- ZIP 写 */

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}
function crc32(buf) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeZip(out, files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data0] of files) {
    const data = Buffer.isBuffer(data0) ? data0 : Buffer.from(String(data0), 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, comp);

    const cent = Buffer.alloc(46);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);
    cent.writeUInt16LE(20, 6);
    cent.writeUInt16LE(0x0800, 8);
    cent.writeUInt16LE(8, 10);
    cent.writeUInt16LE(0, 12);
    cent.writeUInt16LE(0, 14);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(comp.length, 20);
    cent.writeUInt32LE(data.length, 24);
    cent.writeUInt16LE(nameBuf.length, 28);
    cent.writeUInt16LE(0, 30);
    cent.writeUInt16LE(0, 32);
    cent.writeUInt16LE(0, 34);
    cent.writeUInt16LE(0, 36);
    cent.writeUInt32LE(0, 38);
    cent.writeUInt32LE(offset, 42);
    central.push(cent, nameBuf);

    offset += 30 + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(out, Buffer.concat([...parts, centralBuf, eocd]));
}

/* ---------------------------------------------------------------- 文本工具 */

function decode(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
function clean(s) {
  return decode(s).replace(/\s+/g, ' ').trim();
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function attrs(tag) {
  const out = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}
function allText(xml, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(decode(m[1]).replace(/<[^>]+>/g, ''));
  return out.join('');
}

function newSection(model, title) {
  const s = {
    id: 's' + (model.sections.length + 1),
    title: clean(title) || ('第 ' + (model.sections.length + 1) + ' 节'),
    blocks: [],
  };
  model.sections.push(s);
  return s;
}
function addImage(model, zip, entry, folder) {
  const data = zip.read(entry);
  if (!data) return null;
  const ext = (path.extname(entry) || '.png').toLowerCase();
  const name = 'img' + String(model.images + 1).padStart(3, '0') + ext;
  const assets = path.join(folder, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, name), data);
  model.images++;
  return 'assets/' + name;
}

/* ---------------------------------------------------------------- DOCX */

function parseStyles(xml) {
  const map = new Map();
  if (!xml) return map;
  const re = /<w:style(?=[\s>])[\s\S]*?<\/w:style>/g;
  let m;
  while ((m = re.exec(xml))) {
    const id = /w:styleId="([^"]+)"/.exec(m[0]);
    const name = /<w:name[^>]*w:val="([^"]+)"/.exec(m[0]);
    if (id) map.set(id[1], name ? name[1] : '');
  }
  return map;
}
function parseRels(xml) {
  const map = new Map();
  if (!xml) return map;
  const re = /<Relationship(?=[\s>])[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) map.set(a.Id, a.Target);
  }
  return map;
}
function resolveEntry(base, target) {
  const t = String(target).replace(/\\/g, '/');
  if (t.startsWith('/')) return t.slice(1);
  const parts = (base.replace(/\/$/, '') + '/' + t).split('/');
  const stack = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p !== '.' && p !== '') stack.push(p);
  }
  return stack.join('/');
}

function docxPara(xml, styles, rels, model, cur, zip, folder, numbering) {
  const st = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(xml);
  let level = 0;
  if (st) {
    const name = styles.get(st[1]) || '';
    const mm = /(?:heading|标题)\s*(\d)/i.exec(name);
    if (mm) level = Number(mm[1]);
  }
  if (!level) {
    const ol = /<w:outlineLvl[^>]*w:val="(\d+)"/.exec(xml);
    if (ol) level = Number(ol[1]) + 1;
  }
  const text = allText(xml, 'w:t');

  if (level === 1) { newSection(model, text); return; }
  if (level >= 2) {
    cur.blocks.push({ type: 'h', level: Math.min(level, 3), text: clean(text) });
    return;
  }

  const html = runsHtml(xml);
  let imgAdded = false;
  const reImg = /<a:blip[^>]*r:embed="([^"]+)"/g;
  let mi;
  while ((mi = reImg.exec(xml))) {
    const target = rels.get(mi[1]);
    if (!target) continue;
    const src = addImage(model, zip, resolveEntry('word', target), folder);
    if (src) { cur.blocks.push({ type: 'img', src }); imgAdded = true; }
  }
  if (html.trim()) {
    const numId = /<w:numId[^>]*w:val="(\d+)"/.exec(xml)?.[1];
    const level = /<w:ilvl[^>]*w:val="(\d+)"/.exec(xml)?.[1] || '0';
    if (level === '0' && numbering.has(numId)) {
      const number = numbering.get(numId);
      numbering.set(numId, number + 1);
      cur.blocks.push({ type: 'p', html: number + '. ' + html });
      return;
    }
    const styleName = st ? styles.get(st[1]) || '' : '';
    const isList = /<w:numPr[\s>]/.test(xml) || /list|bullet|列表/i.test(styleName);
    if (isList) {
      const type = /number|编号/i.test(styleName) ? 'ol' : 'ul';
      const last = cur.blocks[cur.blocks.length - 1];
      if (last && last.type === type) last.items.push(html);
      else cur.blocks.push({ type, items: [html] });
    } else {
      cur.blocks.push({ type: 'p', html });
    }
  }
  if (imgAdded && !text.trim()) return;
}

function runsHtml(xml) {
  const out = [];
  const re = /<w:r(?=[\s>])[\s\S]*?<\/w:r>/g;
  let m;
  while ((m = re.exec(xml))) {
    let h = '';
    for (const [, text] of m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:br|cr)(?=[\s/])/g)) {
      h += text === undefined ? '<br>' : esc(decode(text));
    }
    if (!h) continue;
    const b = /<w:b(?=[\s/>])/.test(m[0]) && !/w:val="0"/.test(m[0]);
    const i = /<w:i(?=[\s/>])/.test(m[0]) && !/w:val="0"/.test(m[0]);
    if (b) h = '<strong>' + h + '</strong>';
    if (i) h = '<em>' + h + '</em>';
    out.push(h);
  }
  return out.join('');
}

function decimalNumbering(xml) {
  const abstractIds = new Map();
  for (const [, id, spec] of xml.matchAll(/<w:abstractNum\s[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const first = /<w:lvl\s[^>]*w:ilvl="0"[^>]*>([\s\S]*?)<\/w:lvl>/.exec(spec)?.[1];
    if (first && /<w:numFmt\s[^>]*w:val="decimal"/.test(first)) {
      abstractIds.set(id, Number(/<w:start\s[^>]*w:val="(\d+)"/.exec(first)?.[1] || 1));
    }
  }
  const result = new Map();
  for (const [, id, spec] of xml.matchAll(/<w:num\s[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const abstract = /<w:abstractNumId\s[^>]*w:val="(\d+)"/.exec(spec)?.[1];
    if (abstractIds.has(abstract)) result.set(id, abstractIds.get(abstract));
  }
  return result;
}

function docxTable(xml) {
  const rows = [];
  const reTr = /<w:tr(?=[\s>])[\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = reTr.exec(xml))) {
    const cells = [];
    const reTc = /<w:tc(?=[\s>])[\s\S]*?<\/w:tc>/g;
    let c;
    while ((c = reTc.exec(m[0]))) cells.push(clean(allText(c[0], 'w:t')));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseDocx(file, folder, model) {
  const zip = readZip(file);
  const doc = zip.read('word/document.xml');
  if (!doc) throw new Error('docx 里找不到 word/document.xml');
  const styles = parseStyles(zip.read('word/styles.xml'));
  const rels = parseRels(zip.read('word/_rels/document.xml.rels'));
  const numbering = decimalNumbering(zip.read('word/numbering.xml')?.toString('utf8') || '');
  const xml = doc.toString('utf8');
  const b0 = xml.indexOf('<w:body');
  const b1 = xml.lastIndexOf('</w:body>');
  if (b0 < 0 || b1 < 0) throw new Error('docx 正文结构不正确');
  const body = xml.slice(b0, b1);
  let cur = newSection(model, '');
  const reP = /<w:p(?=[\s>])/g;
  const reT = /<w:tbl(?=[\s>])/g;
  let pos = 0;
  while (pos < body.length) {
    reP.lastIndex = pos;
    reT.lastIndex = pos;
    const mp = reP.exec(body);
    const mt = reT.exec(body);
    const np = mp ? mp.index : -1;
    const nt = mt ? mt.index : -1;
    if (nt >= 0 && (np < 0 || nt < np)) {
      const end = body.indexOf('</w:tbl>', nt);
      if (end < 0) break;
      const rows = docxTable(body.slice(nt, end));
      if (rows.length) cur.blocks.push({ type: 'table', rows });
      pos = end + 8;
    } else if (np >= 0) {
      const end = body.indexOf('</w:p>', np);
      if (end < 0) break;
      docxPara(body.slice(np, end), styles, rels, model, cur, zip, folder, numbering);
      if (model.sections.length) cur = model.sections[model.sections.length - 1];
      pos = end + 6;
    } else break;
  }
}

/* ---------------------------------------------------------------- PPTX */

function parsePptx(file, folder, model) {
  const zip = readZip(file);
  const slides = zip.names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)[1]) - Number(/(\d+)\.xml$/.exec(b)[1]));
  if (!slides.length) throw new Error('pptx 里没有幻灯片');
  for (const name of slides) {
    const xml = zip.read(name).toString('utf8');
    const slideName = path.basename(name);
    const rels = parseRels(zip.read('ppt/slides/_rels/' + slideName + '.rels'));
    let title = '';
    const reSp = /<p:sp(?=[\s>])[\s\S]*?<\/p:sp>/g;
    let m;
    const shapes = [];
    while ((m = reSp.exec(xml))) shapes.push(m[0]);
    const body = [];
    for (const sp of shapes) {
      const isTitle = /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp);
      const text = allText(sp, 'a:t');
      if (isTitle && !title) { title = clean(text); continue; }
      const reP = /<a:p(?=[\s>])[\s\S]*?<\/a:p>/g;
      let p;
      while ((p = reP.exec(sp))) {
        const txt = clean(allText(p[0], 'a:t'));
        if (!txt) continue;
        const lvl = /<a:pPr[^>]*lvl="(\d+)"/.exec(p[0]);
        if (lvl && Number(lvl[1]) > 0) {
          const last = body[body.length - 1];
          if (last && last.type === 'ul') last.items.push(esc(txt));
          else body.push({ type: 'ul', items: [esc(txt)] });
        } else body.push({ type: 'p', html: esc(txt) });
      }
    }
    const sec = newSection(model, title);
    sec.blocks.push(...body);
    // 图片
    const rePic = /<p:pic(?=[\s>])[\s\S]*?<\/p:pic>/g;
    let pic;
    while ((pic = rePic.exec(xml))) {
      const em = /<a:blip[^>]*r:embed="([^"]+)"/.exec(pic[0]);
      if (!em) continue;
      const target = rels.get(em[1]);
      if (!target) continue;
      const src = addImage(model, zip, resolveEntry('ppt/slides', target), folder);
      if (src) sec.blocks.push({ type: 'img', src });
    }
    // 表格
    const reTbl = /<a:tbl(?=[\s>])[\s\S]*?<\/a:tbl>/g;
    let tbl;
    while ((tbl = reTbl.exec(xml))) {
      const rows = [];
      const reTr = /<a:tr(?=[\s>])[\s\S]*?<\/a:tr>/g;
      let tr;
      while ((tr = reTr.exec(tbl[0]))) {
        const cells = [];
        const reTc = /<a:tc(?=[\s>])[\s\S]*?<\/a:tc>/g;
        let tc;
        while ((tc = reTc.exec(tr[0]))) cells.push(clean(allText(tc[0], 'a:t')));
        if (cells.length) rows.push(cells);
      }
      if (rows.length) sec.blocks.push({ type: 'table', rows });
    }
  }
}

/* ---------------------------------------------------------------- MD */

function mdInline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function parseMd(source, model) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    .replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '').split('\n');
  let cur = newSection(model, '');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      if (h[1].length === 1) cur = newSection(model, h[2]);
      else cur.blocks.push({ type: 'h', level: Math.min(h[1].length, 3), text: h[2].trim() });
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      cur.blocks.push({ type: 'pre', html: esc(buf.join('\n')) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(mdInline(lines[i++].replace(/^\s*[-*]\s+/, '')));
      cur.blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(mdInline(lines[i++].replace(/^\s*\d+\.\s+/, '')));
      cur.blocks.push({ type: 'ol', items });
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
    cur.blocks.push({ type: 'p', html: mdInline(buf.join(' ')) });
  }
}

/* ---------------------------------------------------------------- 渲染 */

function blockHtml(b) {
  if (b.type === 'p') return '<p>' + b.html + '</p>';
  if (b.type === 'h') return '<h' + b.level + '>' + esc(b.text) + '</h' + b.level + '>';
  if (b.type === 'pre') return '<pre><code>' + b.html + '</code></pre>';
  if (b.type === 'ul' || b.type === 'ol') return '<' + b.type + '>' + b.items.map((x) => '<li>' + x + '</li>').join('') + '</' + b.type + '>';
  if (b.type === 'img') return '<img src="' + esc(b.src) + '" alt="">';
  if (b.type === 'table') {
    if (!b.rows.length) return '';
    let h = '<div class="table-wrap"><table><thead><tr>' + b.rows[0].map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
    for (let r = 1; r < b.rows.length; r++) h += '<tr>' + b.rows[r].map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>';
    return h + '</tbody></table></div>';
  }
  return '';
}

function proseSections(sections) {
  return sections.map((section) => ({
    ...section,
    body: '<div class="workspace-prose">' + section.blocks.map(blockHtml).join('\n') + '</div>',
  }));
}

function officeText(sections) {
  const plain = (html) => decode(html.replace(/<br\s*\/?\s*>/g, '\n').replace(/<[^>]+>/g, ''));
  return sections.flatMap((section) => [
    '# ' + section.title,
    ...section.blocks.flatMap((block) => {
      if (block.type === 'h') return ['## ' + block.text];
      if (block.type === 'p') return [plain(block.html)];
      if (block.type === 'ol') return block.items.map((item, index) => (index + 1) + '. ' + plain(item));
      if (block.type === 'ul') return block.items.map(plain);
      if (block.type === 'table') return block.rows.map((row) => '| ' + row.join(' | ') + ' |');
      return [];
    }),
  ]).join('\n');
}

/* ---------------------------------------------------------------- 主流程 */

function safeId(title) {
  return 'doc-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6);
}

async function convertAndImport(input, opts = {}) {
  const ext = path.extname(input).toLowerCase();
  if (!fs.existsSync(input)) throw new Error('找不到文件：' + input);
  if (ext === '.pdf') throw new Error('PDF 暂不支持：建议先用 Word 打开并另存为 .docx。');
  if (!['.json', '.docx', '.pptx', '.md', '.markdown', '.txt', '.html', '.htm'].includes(ext)) {
    throw new Error('不支持的格式：' + ext + '（支持 Word、PPT、Markdown、纯文本、HTML 和 JSON）');
  }

  const filename = path.basename(input, path.extname(input));
  const htmlSource = ['.html', '.htm'].includes(ext) ? readHtml(fs.readFileSync(input, 'utf8')) : null;
  const markdown = ['.md', '.markdown', '.txt'].includes(ext) ? fs.readFileSync(input, 'utf8') : htmlSource?.markdown ?? null;
  let review = ext === '.json' ? parseReviewJson(fs.readFileSync(input, 'utf8')) : null;
  if (htmlSource?.study) review = parseReviewJson(JSON.stringify({ schema: 'zailao-review@1', title: htmlSource.title || filename, ...htmlSource.study }));
  if (htmlSource && !review && !markdown) throw new Error('这个网页没有可读取的正文，请试试导出为 Word 或纯文本。');
  const id = opts.id || safeId();
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(id) || id.endsWith('.')) throw new Error('无效的存档 ID');
  const frontMatter = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown || '')?.[1];
  const mdTitle = frontMatter?.match(/^title:[ \t]*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  const title = opts.title || review?.title || htmlSource?.title || mdTitle || filename;
  const base = path.join(store.DATA_DIR, 'converted');
  const folder = path.join(base, id);
  if (path.dirname(path.resolve(folder)) !== path.resolve(base)) throw new Error('无效的转换目录');
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });

  const model = { sections: [], images: 0 };
  const original = [];
  if (!review) {
    if (ext === '.docx') parseDocx(input, folder, model);
    else if (ext === '.pptx') parsePptx(input, folder, model);
    else parseMd(markdown, model);
    model.sections = model.sections.filter((s) => s.blocks.length > 0);
    review = buildDetectedReview(detectQuestions(markdown ?? officeText(model.sections)), title);
    if (review) original.push(...model.sections);
  }

  if (review) model.sections = review.sections;
  if (!model.sections.length && !review?.notes?.length) model.sections.push({ id: 's1', title, blocks: [] });
  model.sections.forEach((s, i) => {
    s.id = 's' + (i + 1);
    if (!s.title) s.title = title;
  });
  original.forEach((section, i) => {
    section.id = 'source-' + (i + 1);
    if (!section.title || /^第 \d+ 节$/.test(section.title)) section.title = original.length === 1 ? '导入原文' : '原文第 ' + (i + 1) + ' 节';
  });

  const nav = [];
  for (const [group, sections] of [['讲义', review?.notes || []], [review ? '题库' : '内容', model.sections], ['导入原文', original]]) {
    if (!sections.length) continue;
    nav.push({ group }, ...sections.map((s, i) => ({
      anchor: s.id, title: s.title, badge: String(i + 1).padStart(2, '0'), sectionId: s.id, count: s.questions?.length,
    })));
  }
  const questions = review?.questions || [];

  const manifest = {
    schema: 'fuyan/archive@1',
    ...(review?.schema ? { reviewSchema: review.schema } : {}),
    id,
    title,
    subtitle: review ? '复习展板' : '由文档转换',
    version: '1.0.0',
    builtAt: new Date().toISOString(),
    accent: '#b4552d',
    nav,
    quiz: { total: questions.length, topics: [...new Set(questions.map((q) => q.topic))], tags: [], types: [...new Set(questions.map((q) => q.type))] },
    source: { kind: 'local', file: path.basename(input) },
  };
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
  const html = review ? renderReview(review, title, id, esc, proseSections(original))
    : renderWorkspace({ title, id, sections: proseSections(model.sections), esc });
  fs.writeFileSync(path.join(folder, 'content.html'), html, 'utf8');
  if (review) fs.writeFileSync(path.join(folder, 'questions.json'), JSON.stringify({ count: questions.length, questions }, null, 2), 'utf8');

  const files = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else files.push([r, fs.readFileSync(p)]);
    }
  })(folder, '');

  const zip = path.join(base, id + '.zip');
  writeZip(zip, files);
  const imported = await archiveLib.importArchive(folder, { mode: 'replace' });

  return {
    ok: true,
    id,
    title,
    zip,
    folder,
    sections: model.sections.length + (review?.notes?.length || 0) + original.length,
    images: model.images,
    questionCount: review?.detectedCount ?? questions.length,
    practiceCount: questions.length,
    imported: true,
    manifest: imported.manifest,
  };
}

module.exports = { convertAndImport, readZip, writeZip };
