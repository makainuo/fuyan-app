# -*- coding: utf-8 -*-
"""
把 Word / PPT / Markdown 转成「复研」存档（MVP）。

用法：
  python tools/doc2archive.py --input 资料.docx --id mycourse --title "我的课程"
  python tools/doc2archive.py --input 课件.pptx --id mycourse --title "我的课程"
  python tools/doc2archive.py --input 笔记.md   --id mycourse --title "我的课程"
  # 可选：配套题库（xlsx/csv）
  python tools/doc2archive.py --input 资料.docx --questions 题库.xlsx --id mycourse --title "我的课程"

产出：
  <out>/<id>/manifest.json
  <out>/<id>/content.html
  <out>/<id>/questions.json   （给了 --questions 才有）
  <out>/<id>/assets/...       （文档里的图片）
  <out>/<id>.zip              （可直接导入复研）

说明：
- 标题样式（Heading 1 / 标题 1）→ 大章节；Heading 2/3 → 小节。
- 没有用标题样式的 Word，会退化成“一整章”，需要自己加标题样式。
- PDF 暂不支持：扫描件要 OCR，文字层 PDF 也容易把页眉页脚/分栏混进来；
  建议先在 Word 里打开 PDF 另存为 .docx，或第二阶段再接 PyMuPDF。
"""
import argparse
import csv
import html
import io
import json
import os
import re
import sys
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    from docx.oxml.ns import qn
except Exception:
    Document = None

try:
    from pptx import Presentation
except Exception:
    Presentation = None

try:
    from openpyxl import load_workbook
except Exception:
    load_workbook = None


# ---------------------------------------------------------------- 工具

def esc(s):
    return html.escape(s or '', quote=True)


def slug(s):
    s = re.sub(r'[^0-9A-Za-z._-]+', '-', s or '').strip('-').lower()
    return s or 's'


def read_text_file(path):
    for enc in ('utf-8', 'utf-8-sig', 'gb18030'):
        try:
            return io.open(path, 'r', encoding=enc).read()
        except UnicodeDecodeError:
            continue
    raise SystemExit('无法识别文件编码：%s' % path)


def md_inline(s):
    t = esc(s)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    return t


# ---------------------------------------------------------------- 文档模型
# section = {id, title, blocks:[...]}
# block   = {'type':'p','html':...} / {'type':'h','level':2,'text':...}
#           / {'type':'ul'|'ol','items':[html,...]}
#           / {'type':'table','rows':[[text,...]]}
#           / {'type':'img','src':...}

class Builder:
    def __init__(self):
        self.sections = []
        self.images = 0

    def new_section(self, title):
        sid = 's%d' % (len(self.sections) + 1)
        self.sections.append({'id': sid, 'title': title or ('第 %d 节' % (len(self.sections) + 1)), 'blocks': []})
        return self.sections[-1]

    def cur(self):
        if not self.sections:
            self.new_section('正文')
        return self.sections[-1]

    def add(self, block):
        self.cur()['blocks'].append(block)

    def add_image(self, data, ext, out_dir, alt=''):
        self.images += 1
        name = 'img%03d.%s' % (self.images, ext)
        d = os.path.join(out_dir, 'assets')
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), 'wb') as f:
            f.write(data)
        self.add({'type': 'img', 'src': 'assets/' + name, 'alt': alt})


def render_runs(p, out_dir=None, builder=None):
    """把 python-docx 段落转成带粗体/斜体/行内代码的 HTML。"""
    parts = []
    for r in p.runs:
        t = r.text
        if not t:
            continue
        t = esc(t)
        if r.bold:
            t = '<strong>%s</strong>' % t
        if r.italic:
            t = '<em>%s</em>' % t
        if r.font and r.font.name and 'mono' in (r.font.name or '').lower():
            t = '<code>%s</code>' % t
        parts.append(t)
    if not parts and p.text:
        parts.append(esc(p.text))
    return ''.join(parts)


def paragraph_style_level(p):
    name = (p.style.name if p.style is not None else '') or ''
    m = re.search(r'(Heading|标题)\s*(\d)', name, re.I)
    if m:
        return int(m.group(2))
    # 中文 Word 有时把标题放在 outline level 里
    try:
        pPr = p._p.pPr
        if pPr is not None and pPr.outlineLvl is not None:
            return int(pPr.outlineLvl.val) + 1
    except Exception:
        pass
    return 0


def is_list_para(p):
    try:
        if p._p.pPr is not None and p._p.pPr.numPr is not None:
            return True
    except Exception:
        pass
    name = (p.style.name if p.style is not None else '') or ''
    return name.lower().startswith('list') or '列表' in name


def extract_docx(path, out_dir):
    if Document is None:
        raise SystemExit('缺 python-docx：pip install python-docx')
    doc = Document(path)
    b = Builder()

    def add_para(p):
        lvl = paragraph_style_level(p)
        if lvl == 1:
            b.new_section(p.text.strip() or '未命名章节')
            return
        if lvl >= 2:
            b.add({'type': 'h', 'level': min(lvl, 3), 'text': p.text.strip()})
            return
        if is_list_para(p):
            ordered = 'number' in ((p.style.name or '').lower()) or '编号' in (p.style.name or '')
            item = render_runs(p)
            if not item.strip():
                return
            last = b.cur()['blocks'][-1] if b.cur()['blocks'] else None
            typ = 'ol' if ordered else 'ul'
            if last and last['type'] == typ:
                last['items'].append(item)
            else:
                b.add({'type': typ, 'items': [item]})
            return
        txt = render_runs(p)
        if txt.strip():
            b.add({'type': 'p', 'html': txt})

    def add_table(t):
        rows = []
        for row in t.rows:
            cells = []
            for c in row.cells:
                cells.append(' '.join([x.text for x in c.paragraphs]).strip())
            rows.append(cells)
        if rows:
            b.add({'type': 'table', 'rows': rows})

    # 按正文顺序遍历段落/表格
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn('w:p'):
            p = Paragraph(child, doc)
            # 段落里的图片
            blips = child.findall('.//' + qn('a:blip'))
            if blips:
                for blip in blips:
                    rid = blip.get(qn('r:embed'))
                    if not rid:
                        continue
                    part = doc.part.related_parts.get(rid)
                    if part is None:
                        continue
                    ext = os.path.splitext(str(part.partname))[1].lstrip('.').lower() or 'png'
                    b.add_image(part.blob, ext, out_dir)
                # 有图时仍然保留文字（图注）
            add_para(p)
        elif child.tag == qn('w:tbl'):
            add_table(Table(child, doc))

    if not b.sections:
        b.new_section(os.path.splitext(os.path.basename(path))[0])
    return b


def extract_pptx(path, out_dir):
    if Presentation is None:
        raise SystemExit('缺 python-pptx：pip install python-pptx')
    prs = Presentation(path)
    b = Builder()
    for slide in prs.slides:
        title = ''
        try:
            if slide.shapes.title is not None:
                title = slide.shapes.title.text.strip()
        except Exception:
            pass
        b.new_section(title or ('第 %d 页' % (len(b.sections) + 1)))
        for shape in slide.shapes:
            try:
                if shape.shape_type == 13 and shape.image is not None:  # PICTURE
                    ext = (shape.image.ext or 'png').lower()
                    b.add_image(shape.image.blob, ext, out_dir)
                    continue
            except Exception:
                pass
            if getattr(shape, 'has_table', False):
                rows = []
                for row in shape.table.rows:
                    rows.append([c.text.strip() for c in row.cells])
                b.add({'type': 'table', 'rows': rows})
                continue
            if getattr(shape, 'has_text_frame', False):
                for p in shape.text_frame.paragraphs:
                    txt = ''.join([r.text for r in p.runs]).strip()
                    if not txt:
                        continue
                    if p.level and p.level > 0:
                        last = b.cur()['blocks'][-1] if b.cur()['blocks'] else None
                        item = esc(txt)
                        if last and last['type'] == 'ul':
                            last['items'].append(item)
                        else:
                            b.add({'type': 'ul', 'items': [item]})
                    else:
                        b.add({'type': 'p', 'html': esc(txt)})
    if not b.sections:
        b.new_section('正文')
    return b


def extract_md(path, out_dir):
    text = read_text_file(path)
    b = Builder()
    lines = text.replace('\r\n', '\n').split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            lvl = len(m.group(1))
            title = m.group(2).strip()
            if lvl == 1:
                b.new_section(title)
            else:
                b.add({'type': 'h', 'level': min(lvl, 3), 'text': title})
            i += 1
            continue
        if line.startswith('```'):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            b.add({'type': 'pre', 'text': '\n'.join(buf)})
            continue
        if re.match(r'^\s*[-*]\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(md_inline(re.sub(r'^\s*[-*]\s+', '', lines[i])))
                i += 1
            b.add({'type': 'ul', 'items': items})
            continue
        if re.match(r'^\s*\d+\.\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\s*\d+\.\s+', lines[i]):
                items.append(md_inline(re.sub(r'^\s*\d+\.\s+', '', lines[i])))
                i += 1
            b.add({'type': 'ol', 'items': items})
            continue
        # 段落
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,6}\s|```|\s*[-*]\s|\s*\d+\.\s)', lines[i]):
            buf.append(lines[i])
            i += 1
        b.add({'type': 'p', 'html': md_inline(' '.join(buf))})
    if not b.sections:
        b.new_section('正文')
    return b


# ---------------------------------------------------------------- 题库

def build_questions(path):
    rows = []
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.xlsx', '.xlsm'):
        if load_workbook is None:
            raise SystemExit('缺 openpyxl：pip install openpyxl')
        wb = load_workbook(path, data_only=True)
        ws = wb.active
        values = list(ws.iter_rows(values_only=True))
        if not values:
            return []
        header = [str(x or '').strip().lower() for x in values[0]]
        for row in values[1:]:
            rows.append({header[i]: row[i] for i in range(min(len(header), len(row)))})
    elif ext in ('.csv', '.tsv'):
        with io.open(path, 'r', encoding='utf-8-sig', newline='') as f:
            reader = csv.DictReader(f)
            for r in reader:
                rows.append({(k or '').strip().lower(): v for k, v in r.items()})
    else:
        raise SystemExit('题库只支持 xlsx / csv：%s' % path)

    questions = []
    for idx, r in enumerate(rows, 1):
        stem = str(r.get('stem') or r.get('题干') or '').strip()
        if not stem:
            continue
        typ = str(r.get('type') or r.get('题型') or 'single').strip().lower()
        opts = []
        for key in ('a', 'b', 'c', 'd', 'e', 'f'):
            v = r.get(key, r.get(key.upper(), ''))
            if v is not None and str(v).strip():
                opts.append({'zh': str(v).strip(), 'en': None})
        ans = str(r.get('answer') or r.get('答案') or '').strip()
        explain = str(r.get('explain') or r.get('解析') or '').strip()
        topic = str(r.get('topic') or r.get('专题') or '').strip()
        tags_raw = str(r.get('tags') or r.get('标签') or '').strip()
        tags = [t for t in re.split(r'[,，;；\s]+', tags_raw) if t]
        q = {
            'id': str(r.get('id') or 'Q-%03d' % idx).strip(),
            'type': typ,
            'topic': topic,
            'tags': tags,
            'src': '',
            'stem': stem,
            'stemEn': None,
            'options': opts,
            'answer': [],
            'answerText': None,
            'explain': explain,
            'raw': None,
        }
        if typ in ('explain', 'short', 'fill', 'text'):
            q['answerText'] = [ans] if ans else []
        elif typ in ('truefalse', '判断'):
            q['type'] = 'truefalse'
            q['answerText'] = ['true'] if ans.lower() in ('true', 't', '对', '正确', '√', '1') else ['false']
        else:
            letters = re.findall(r'[A-Fa-f]', ans)
            if len(letters) > 1:
                q['type'] = 'multi'
            else:
                q['type'] = 'single'
            q['answer'] = sorted({ord(x.upper()) - 65 for x in letters})
        questions.append(q)
    return questions


# ---------------------------------------------------------------- 渲染

def block_html(block):
    t = block['type']
    if t == 'p':
        return '<p>%s</p>' % block['html']
    if t == 'h':
        lvl = block['level']
        return '<h%d>%s</h%d>' % (lvl, esc(block['text']), lvl)
    if t in ('ul', 'ol'):
        return '<%s>%s</%s>' % (t, ''.join('<li>%s</li>' % x for x in block['items']), t)
    if t == 'pre':
        return '<pre><code>%s</code></pre>' % esc(block['text'])
    if t == 'table':
        rows = block['rows']
        if not rows:
            return ''
        head = ''.join('<th>%s</th>' % esc(x) for x in rows[0])
        body = ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % esc(x) for x in r) for r in rows[1:])
        return '<div class="table-wrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (head, body)
    if t == 'img':
        return '<img src="%s" alt="%s">' % (esc(block['src']), esc(block.get('alt', '')))
    return ''


CSS = """
:root{--bg:#faf7f0;--panel:#fffdf7;--ink:#20201a;--muted:#6b6b5e;--line:#e7dfd0;--accent:#b4552d}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Serif SC","Songti SC","SimSun",serif;line-height:1.9}
main{max-width:900px;margin:0 auto;padding:30px 34px 90px}
section{margin-bottom:44px}
h1{font-size:30px;margin:8px 0 6px;padding-bottom:8px;border-bottom:2px solid var(--accent)}
h2{font-size:21px;margin:30px 0 10px;padding-left:10px;border-left:4px solid var(--accent)}
h3{font-size:17px;margin:22px 0 8px}
p{margin:10px 0}
ul,ol{margin:10px 0 10px 24px;padding:0}
li{margin:4px 0}
.table-wrap{overflow:auto;margin:14px 0}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--panel)}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f3ecdd}
img{max-width:100%;border-radius:10px;margin:12px 0}
pre{background:#2b2a26;color:#f4efe4;padding:14px 16px;border-radius:10px;overflow:auto}
code{font-family:ui-monospace,Consolas,monospace;background:#f0e9da;padding:1px 5px;border-radius:4px}
pre code{background:none;padding:0;color:inherit}
"""


def render_html(builder, title, accent):
    css = CSS.replace('--accent:#b4552d', '--accent:%s' % accent)
    parts = []
    for sec in builder.sections:
        body = ''.join(block_html(b) for b in sec['blocks'])
        parts.append('<section id="%s">\n<h1>%s</h1>\n%s\n</section>' % (sec['id'], esc(sec['title']), body))
    return ('<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>%s</title>\n<style>%s</style>\n</head>\n<body>\n<main>\n%s\n</main>\n</body>\n</html>\n'
            % (esc(title), css, '\n'.join(parts)))


def make_manifest(builder, aid, title, subtitle, version, accent, questions, source):
    nav = [{ 'group': '内容' }]
    for i, sec in enumerate(builder.sections, 1):
        nav.append({'anchor': sec['id'], 'title': sec['title'], 'badge': '%02d' % i, 'sectionId': sec['id']})
    topics, tags, types = [], [], []
    for q in questions:
        if q['topic'] and q['topic'] not in topics:
            topics.append(q['topic'])
        for t in q['tags']:
            if t not in tags:
                tags.append(t)
        if q['type'] not in types:
            types.append(q['type'])
    return {
        'schema': 'fuyan/archive@1',
        'id': aid,
        'title': title,
        'subtitle': subtitle,
        'version': version,
        'builtAt': __import__('datetime').datetime.now().strftime('%Y-%m-%dT%H:%M:%S+0800'),
        'accent': accent,
        'nav': nav,
        'quiz': {'total': len(questions), 'topics': topics, 'tags': tags, 'types': types},
        'source': {'kind': 'local', 'file': source},
    }


def write_zip(folder, zip_path):
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(folder):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, folder)
                z.write(full, rel)


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser(description='Word / PPT / Markdown → 复研存档')
    ap.add_argument('--input', required=True, help='源文件：.docx / .pptx / .md')
    ap.add_argument('--id', required=True, help='存档 id（字母数字._-）')
    ap.add_argument('--title', required=True, help='课名')
    ap.add_argument('--subtitle', default='', help='副标题')
    ap.add_argument('--version', default='1.0.0')
    ap.add_argument('--accent', default='#b4552d')
    ap.add_argument('--questions', default='', help='题库 .xlsx / .csv（可选）')
    ap.add_argument('--out', default='.', help='输出目录（默认当前目录）')
    args = ap.parse_args()

    if not re.match(r'^[0-9A-Za-z._-]+$', args.id):
        raise SystemExit('id 只能包含字母、数字、点、下划线、短横线')

    src = args.input
    if not os.path.isfile(src):
        raise SystemExit('找不到输入文件：%s' % src)
    ext = os.path.splitext(src)[1].lower()

    out_root = os.path.abspath(args.out)
    folder = os.path.join(out_root, args.id)
    os.makedirs(folder, exist_ok=True)

    if ext == '.docx':
        builder = extract_docx(src, folder)
    elif ext == '.pptx':
        builder = extract_pptx(src, folder)
    elif ext in ('.md', '.markdown', '.txt'):
        builder = extract_md(src, folder)
    elif ext == '.pdf':
        raise SystemExit('PDF 暂不支持：建议先在 Word 里打开并另存为 .docx，或用第二阶段 OCR 方案。')
    else:
        raise SystemExit('不支持的格式：%s（目前支持 .docx / .pptx / .md）' % ext)

    questions = build_questions(args.questions) if args.questions else []

    manifest = make_manifest(builder, args.id, args.title, args.subtitle, args.version,
                             args.accent, questions, os.path.basename(src))
    with io.open(os.path.join(folder, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    with io.open(os.path.join(folder, 'content.html'), 'w', encoding='utf-8') as f:
        f.write(render_html(builder, args.title, args.accent))
    if questions:
        with io.open(os.path.join(folder, 'questions.json'), 'w', encoding='utf-8') as f:
            json.dump({'schema': 'fuyan/questions@1', 'count': len(questions), 'questions': questions},
                      f, ensure_ascii=False, indent=1)

    zip_path = os.path.join(out_root, args.id + '.zip')
    write_zip(folder, zip_path)

    print('[ok] %s' % args.title)
    print('     章节 %d · 图片 %d · 题目 %d' % (len(builder.sections), builder.images, len(questions)))
    print('     目录 %s' % folder)
    print('     安装包 %s' % zip_path)


if __name__ == '__main__':
    main()
