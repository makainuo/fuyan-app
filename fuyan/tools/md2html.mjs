/**
 * 极简 Markdown → 单文件 HTML（够用即可：标题/段落/列表/表格/代码块/引用/行内格式）
 * 用法：node tools/md2html.mjs <input.md> <output.html> [标题]
 */
import fs from 'node:fs';

const [, , inFile, outFile, docTitle] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node md2html.mjs <in.md> <out.html> [title]');
  process.exit(1);
}
const md = fs.readFileSync(inFile, 'utf8').replace(/\r\n/g, '\n');
const lines = md.split('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

const out = [];
let i = 0;
let inCode = false;
let codeLang = '';
let codeBuf = [];

const flushCode = () => {
  const cls = codeLang ? ` class="lang-${esc(codeLang)}"` : '';
  out.push(`<pre><code${cls}>${esc(codeBuf.join('\n'))}</code></pre>`);
  codeBuf = [];
  codeLang = '';
};

while (i < lines.length) {
  const line = lines[i];

  if (line.startsWith('```')) {
    if (!inCode) {
      inCode = true;
      codeLang = line.slice(3).trim();
    } else {
      inCode = false;
      flushCode();
    }
    i++;
    continue;
  }
  if (inCode) {
    codeBuf.push(line);
    i++;
    continue;
  }

  if (!line.trim()) {
    i++;
    continue;
  }

  // 代码块
  if (line.startsWith('```')) continue;

  // 标题
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const text = inline(h[2]);
    const id = `h-${out.length}-${level}`;
    out.push(`<h${level} id="${id}">${text}</h${level}>`);
    i++;
    continue;
  }

  // 分隔线
  if (/^---+$/.test(line.trim())) {
    out.push('<hr>');
    i++;
    continue;
  }

  // 表格
  if (/^\|/.test(line.trim()) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
    const header = line.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i].trim())) {
      rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim()));
      i++;
    }
    out.push('<div class="table-wrap"><table>');
    out.push('<thead><tr>' + header.map((x) => `<th>${inline(x)}</th>`).join('') + '</tr></thead>');
    out.push('<tbody>');
    for (const r of rows) out.push('<tr>' + r.map((x) => `<td>${inline(x)}</td>`).join('') + '</tr>');
    out.push('</tbody></table></div>');
    continue;
  }

  // 引用
  if (/^>\s?/.test(line)) {
    const buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      buf.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    out.push(`<blockquote>${buf.map((x) => inline(x)).join('<br>')}</blockquote>`);
    continue;
  }

  // 列表
  const isUl = /^\s*[-*]\s+/.test(line);
  const isOl = /^\s*\d+\.\s+/.test(line);
  if (isUl || isOl) {
    const tag = isUl ? 'ul' : 'ol';
    out.push(`<${tag}>`);
    while (i < lines.length && (isUl ? /^\s*[-*]\s+/.test(lines[i]) : /^\s*\d+\.\s+/.test(lines[i]))) {
      let item = lines[i].replace(isUl ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/, '');
      let prefix = '';
      if (/^\[ \]/.test(item)) {
        prefix = '<span class="cb">☐</span> ';
        item = item.replace(/^\[ \]\s*/, '');
      } else if (/^\[x\]/i.test(item)) {
        prefix = '<span class="cb done">☑</span> ';
        item = item.replace(/^\[x\]\s*/i, '');
      }
      out.push(`<li>${prefix}${inline(item)}</li>`);
      i++;
    }
    out.push(`</${tag}>`);
    continue;
  }

  // 段落：连续非空行合并
  const buf = [line];
  i++;
  while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\||>|\s*[-*]\s|\s*\d+\.\s|---+$)/.test(lines[i])) {
    buf.push(lines[i]);
    i++;
  }
  out.push(`<p>${buf.map((x) => inline(x)).join('<br>')}</p>`);
}

if (inCode) flushCode();

// 目录：h2
const toc = [];
for (const html of out) {
  const m = html.match(/^<h2 id="([^"]+)">(.*?)<\/h2>$/);
  if (m) toc.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, '') });
}

const title = docTitle || (md.match(/^#\s+(.*)$/m) || [, '文档'])[1];

const css = `
:root{--bg:#faf7f0;--panel:#fffdf7;--ink:#20201a;--muted:#6b6b5e;--line:#e7dfd0;--accent:#b4552d;--code:#2b2a26}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.85 "Noto Serif SC","Songti SC","SimSun",serif}
.wrap{max-width:900px;margin:0 auto;padding:40px 30px 100px}
h1{font-size:34px;line-height:1.3;margin:6px 0 8px}
h2{font-size:23px;margin:42px 0 12px;padding-left:12px;border-left:5px solid var(--accent);line-height:1.4}
h3{font-size:18px;margin:26px 0 8px}
p{margin:10px 0}
a{color:var(--accent)}
code{font-family:ui-monospace,Consolas,"Cascadia Code",monospace;background:#f0e9da;padding:1px 5px;border-radius:5px;font-size:.9em}
pre{background:var(--code);color:#f4efe4;padding:16px 18px;border-radius:12px;overflow:auto;line-height:1.65;font-size:13.5px}
pre code{background:none;padding:0;color:inherit;font-size:inherit}
blockquote{margin:14px 0;padding:10px 16px;border-left:4px solid var(--accent);background:var(--panel);color:var(--ink)}
hr{border:0;border-top:1px dashed var(--line);margin:34px 0}
.table-wrap{overflow:auto;margin:14px 0}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--panel)}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f3ecdd;font-weight:600}
ul,ol{margin:10px 0 10px 22px;padding:0}
li{margin:4px 0}
.cb{color:var(--muted)}
.cb.done{color:#3f7a4a}
.toc{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin:24px 0 8px}
.toc b{display:block;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:6px}
.toc a{display:block;padding:3px 0;text-decoration:none;color:var(--ink)}
.toc a:hover{color:var(--accent)}
.lead{color:var(--muted);font-size:14px}
`;

const tocHtml = toc.length
  ? `<div class="toc"><b>目录</b>${toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join('')}</div>`
  : '';

let body = out.join('\n');
if (tocHtml && /<\/h1>/.test(body)) {
  body = body.replace(/<\/h1>/, '</h1>\n' + tocHtml);
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
${body}
</div>
</body>
</html>
`;

fs.writeFileSync(outFile, html, 'utf8');
console.log('written', outFile, html.length);
