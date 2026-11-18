/* 再捞我一下 · 应用入口：路由 + 全局状态装载 */
import { state, $, esc, applyTheme, toggleTheme, toast, emit, openModal, closeModal } from './core.js';
import { api } from './api.js';
import * as library from './library.js';
import * as reader from './reader.js';
import * as quiz from './quiz.js';
import * as notes from './notes.js';
import * as settings from './settings.js';
import { openSearch } from './search.js';

const views = { library, reader, quiz, notes, settings };
let current = null;

/* ---------------------------------------------------------------- 前进/后退 */
const nav = { stack: [], idx: -1, silent: false };
const hashNow = () => location.hash || '#/';

function updateNavButtons() {
  const b = $('#btn-back');
  const f = $('#btn-forward');
  if (b) b.disabled = nav.idx <= 0;
  if (f) f.disabled = nav.idx >= nav.stack.length - 1;
}

function recordNav() {
  const h = hashNow();
  if (nav.silent) {
    nav.silent = false;
    return updateNavButtons();
  }
  if (nav.stack[nav.idx] === h) return updateNavButtons();
  // 用户用浏览器自己的前进/后退
  if (nav.idx > 0 && nav.stack[nav.idx - 1] === h) { nav.idx--; return updateNavButtons(); }
  if (nav.idx < nav.stack.length - 1 && nav.stack[nav.idx + 1] === h) { nav.idx++; return updateNavButtons(); }
  nav.stack = nav.stack.slice(0, nav.idx + 1);
  nav.stack.push(h);
  nav.idx = nav.stack.length - 1;
  updateNavButtons();
}

function navBack() {
  if (nav.idx <= 0) return;
  nav.idx--;
  nav.silent = true;
  location.hash = nav.stack[nav.idx];
  updateNavButtons();
}

function navForward() {
  if (nav.idx >= nav.stack.length - 1) return;
  nav.idx++;
  nav.silent = true;
  location.hash = nav.stack[nav.idx];
  updateNavButtons();
}

/* ---------------------------------------------------------------- 存档装载 */
const archiveCache = new Map();

export async function loadArchive(id) {
  if (archiveCache.has(id)) {
    const a = archiveCache.get(id);
    state.archiveId = id;
    state.manifest = a.manifest;
    state.questions = a.questions;
    return a;
  }
  const [{ manifest }, q] = await Promise.all([api.getArchive(id), api.getQuestions(id)]);
  const a = { manifest, questions: q.questions || [] };
  archiveCache.set(id, a);
  state.archiveId = id;
  state.manifest = manifest;
  state.questions = a.questions;
  return a;
}

export async function loadUserData(id) {
  const [n, p] = await Promise.all([api.getNotes(id), api.getProgress(id)]);
  state.notes = n.notes.items || [];
  state.progress = p.progress;
  updateNoteCount();
  return { notes: state.notes, progress: state.progress };
}

export function updateNoteCount() {
  const el = $('#note-count');
  const n = (state.notes || []).length;
  el.textContent = String(n);
  el.hidden = n === 0;
}

export async function reloadArchives() {
  const r = await api.listArchives();
  state.archives = (r.archives || []).sort((a, b) => {
    const t = String(b.builtAt || '').localeCompare(String(a.builtAt || ''));
    return t !== 0 ? t : String(a.title || '').localeCompare(String(b.title || ''), 'zh');
  });
  emit('archives', state.archives);
  return state.archives;
}

/* ---------------------------------------------------------------- 路由 */
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  if (!seg.length) return { view: 'library', params: {}, query };
  const [name, ...rest] = seg;
  if (name === 'read') return { view: 'reader', params: { id: rest[0] }, query };
  if (name === 'quiz') return { view: 'quiz', params: { id: rest[0], mode: rest[1] }, query };
  if (name === 'notes') return { view: 'notes', params: { id: rest[0] }, query };
  if (name === 'settings') return { view: 'settings', params: {}, query };
  return { view: 'library', params: {}, query };
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

export function setCrumbs(html) {
  $('#crumbs').innerHTML = html;
}

async function route() {
  const { view, params, query } = parseRoute();
  const mod = views[view] || views.library;
  if (current && current.destroy && current !== mod) {
    try { current.destroy(); } catch (_) {}
  } else if (current && current === mod && mod.update && view !== 'reader') {
    // 同视图内切换（如 quiz 题号），交给视图自己处理
  }
  current = mod;
  document.body.classList.toggle('reading', view === 'reader');
  // 侧栏/主区复位
  const side = $('#side');
  const main = $('#main');
  side.hidden = true;
  main.className = 'main';
  main.innerHTML = '';
  try {
    await mod.render(params, query);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="wrap"><div class="empty"><div class="big">出错了</div><p>${esc(e.message || e)}</p>
      <p><button class="btn" onclick="location.hash='#/'">回到存档库</button></p></div></div>`;
  }
  updateHeader();
}

function updateHeader() {
  const id = state.archiveId;
  $('#btn-notes').disabled = !id;
  $('#btn-quiz').disabled = !id || !state.questions.length;
  $('#btn-notes').style.opacity = id ? 1 : 0.45;
  $('#btn-quiz').style.opacity = id && state.questions.length ? 1 : 0.45;
}

/* ---------------------------------------------------------------- 侧栏 */
export function renderSide(manifest, activeSectionId) {
  const side = $('#side');
  side.hidden = false;
  const items = (manifest.nav || [])
    .map((n) => {
      if (n.group) return `<div class="grp">${esc(n.group)}</div>`;
      const sid = n.sectionId || '';
      return `<div class="side-item" data-for="${esc(sid)}">
        <a href="#/read/${manifest.id}?s=${encodeURIComponent(sid || n.anchor)}" data-section="${esc(sid)}" class="${sid && sid === activeSectionId ? 'on' : ''}">
        <span class="no">${esc(n.badge || '·')}</span><span class="t">${esc(n.title)}</span>
        ${n.count ? `<span class="n">${n.count}</span>` : ''}</a>
        <div class="side-sub" hidden></div>
      </div>`;
    })
    .join('');
  side.innerHTML = `${items}
    <div class="side-actions">
      <button class="btn sm" data-side="quiz">▤ 刷题${manifest.quiz && manifest.quiz.total ? `（${manifest.quiz.total}）` : ''}</button>
      <button class="btn sm" data-side="notes">✎ 批注</button>
    </div>
    <div class="side-foot">${esc(manifest.subtitle || '')}<br>v${esc(manifest.version || '')}</div>`;
  arrangeLessonLinks(side, manifest.nav || []);
  side.querySelectorAll('[data-side]').forEach((b) => {
    b.onclick = () => go(b.dataset.side === 'quiz' ? `#/quiz/${manifest.id}` : `#/notes/${manifest.id}`);
  });
  side.querySelectorAll('a[data-section]').forEach((a) => {
    a.addEventListener('click', (e) => {
      // 阅读器内：直接滚动，不重新加载 iframe
      if (a.dataset.toc === '1') return; // 目录模式下由阅读器接管（点击展开/收起）
      if (state.reader && state.reader.goto) {
        e.preventDefault();
        state.reader.goto(a.dataset.section || '');
      }
    });
  });
}

// 可选的 parent 指向同一存档中的课次 sectionId。
function arrangeLessonLinks(side, nav) {
  const links = new Map([...side.querySelectorAll('a[data-section]')]
    .map((link) => [link.dataset.section, link]));
  const groups = new Map();
  for (const entry of nav) {
    if (!entry.parent || entry.parent === entry.sectionId) continue;
    const parent = links.get(entry.parent);
    const child = links.get(entry.sectionId);
    if (!parent || !child) continue;
    // 新版阅读器会为普通章节自动生成标题目录。逐课目录使用显式子项。
    const parentItem = parent.closest('.side-item');
    const childItem = child.closest('.side-item');
    if (parentItem) parentItem.classList.remove('side-item');
    if (childItem) childItem.classList.remove('side-item');
    let group = groups.get(entry.parent);
    if (!group) {
      group = document.createElement('div');
      group.id = 'lesson-children-' + entry.parent;
      group.dataset.lessonChildren = entry.parent;
      group.style.paddingInlineStart = '14px';
      group.hidden = true;
      parent.setAttribute('aria-controls', group.id);
      parent.setAttribute('aria-expanded', 'false');
      (parentItem || parent).after(group);
      groups.set(entry.parent, group);
    }
    child.dataset.lessonParent = entry.parent;
    group.append(childItem || child);
  }
}

export function markSideActive(sectionId) {
  const active = [...document.querySelectorAll('#side a[data-section]')]
    .find((link) => link.dataset.section === sectionId);
  const lesson = active?.dataset.lessonParent || sectionId;
  document.querySelectorAll('#side [data-lesson-children]').forEach((group) => {
    const open = group.dataset.lessonChildren === lesson;
    group.hidden = !open;
    const parent = [...document.querySelectorAll('#side a[aria-controls]')]
      .find((link) => link.getAttribute('aria-controls') === group.id);
    parent?.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('#side a[data-section]').forEach((a) => {
    a.classList.toggle('on', a.dataset.section === sectionId);
  });
}

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  // 主题
  let theme = 'light';
  try { theme = localStorage.getItem('fuyan.theme') || 'auto'; } catch (_) {}
  applyTheme(theme);

  try {
    const cr = await api.getConfig();
    state.config = cr.config;
    state.aiReady = !!cr.hasKey;
    if (state.config && state.config.ui && state.config.ui.theme && !localStorage.getItem('fuyan.theme')) {
      applyTheme(state.config.ui.theme);
    }
  } catch (e) {
    console.warn('读取配置失败', e);
  }

  bindHeader();

  window.addEventListener('hashchange', () => {
    recordNav();
    route();
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearch();
    }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navBack(); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navForward(); }
    if (e.key === 'Escape') {
      const cmdk = $('#cmdk');
      if (cmdk && !cmdk.hidden) cmdk.hidden = true;
    }
  });

  await reloadArchives();
  if (!location.hash) location.hash = '#/';
  nav.stack = [hashNow()];
  nav.idx = 0;
  await route();
  updateNavButtons();
  checkUpdateSoon();

  $('#boot').classList.add('gone');
  setTimeout(() => $('#boot').remove(), 500);

  const params = new URLSearchParams(location.search);
  if (params.has('e2e')) {
    import('./e2e.js').then((m) => m.run(params.get('e2e') || 'reader')).catch((e) => {
      document.title = 'E2E ERROR ' + e.message;
    });
  }
}

function bindHeader() {
  $('#btn-search').onclick = () => openSearch();
  $('#btn-theme').onclick = () => toggleTheme();
  $('#btn-settings').onclick = () => go('#/settings');
  $('#btn-back').onclick = navBack;
  $('#btn-forward').onclick = navForward;
  $('#btn-update').onclick = () => openUpdateBox();
  $('#btn-notes').onclick = () => {
    if (!state.archiveId) return toast('先打开一个存档', 'bad');
    go(`#/notes/${state.archiveId}`);
  };
  $('#btn-quiz').onclick = () => {
    if (!state.archiveId) return toast('先打开一个存档', 'bad');
    if (!state.questions.length) return toast('这个存档没有题库', 'bad');
    go(`#/quiz/${state.archiveId}`);
  };
}

/* ---------------------------------------------------------------- 软件更新 */
let updateInfo = null;

async function checkUpdateSoon() {
  try {
    const r = await api.appUpdate();
    updateInfo = r;
    const btn = $('#btn-update');
    if (r && r.ok && r.hasUpdate) {
      btn.hidden = false;
      btn.title = r.message || '有新版本';
      btn.textContent = `⬆ v${r.remote.version}`;
    } else {
      btn.hidden = true;
    }
  } catch (_) {}
}

export function openUpdateBox(info = updateInfo) {
  const r = info || {};
  const remote = r.remote || {};
  const local = r.local || {};
  const canOpen = /^https?:\/\//.test(remote.url || '');
  const box = openModal(
    `<h3>软件更新</h3>
     <p class="sub">当前 v${esc(local.version || '')}${remote.version ? ` · 远端 v${esc(remote.version)}` : ''}</p>
     ${r.ok ? '' : `<div class="note" style="margin-bottom:12px">${esc(r.message || '检查失败')}</div>`}
     ${r.ok && r.hasUpdate ? `<div class="verdict ok" style="margin:0 0 12px"><b>${esc(r.message)}</b></div>` : ''}
     ${remote.notes ? `<div class="note"><b>更新内容</b><br>${esc(remote.notes)}</div>` : ''}
     <p class="sub" data-u="status" role="status" hidden></p>
     <progress data-u="progress" max="100" style="width:100%" hidden></progress>
     <div class="foot">
       <button class="btn" data-u="close">关闭</button>
       <button class="btn" data-u="recheck">重新检查</button>
       ${canOpen ? '<button class="btn" data-u="open">浏览器下载</button>' : ''}
       ${r.canInstall ? '<button class="btn primary" data-u="download">下载并更新</button>' : ''}
       <button class="btn primary" data-u="install" hidden>重启并安装</button>
       ${r.configured === false ? '<button class="btn" data-u="settings">去设置更新源</button>' : ''}
     </div>`,
    {
      onMount(el) {
        el.querySelector('[data-u=close]').onclick = closeModal;
        el.querySelector('[data-u=recheck]').onclick = async () => {
          closeModal();
          await checkUpdateSoon();
          openUpdateBox();
        };
        const o = el.querySelector('[data-u=open]');
        if (o) o.onclick = () => api.openExternal(remote.url).catch(() => {});
        const s = el.querySelector('[data-u=settings]');
        if (s) s.onclick = () => { closeModal(); go('#/settings'); };
        bindUpdateJob(el, remote.version);
      },
    }
  );
  return box;
}

function bindUpdateJob(box, version) {
  const status = box.querySelector('[data-u=status]');
  const progress = box.querySelector('[data-u=progress]');
  const download = box.querySelector('[data-u=download]');
  const install = box.querySelector('[data-u=install]');
  let timer;
  let restarting = false;
  let restartDeadline = 0;

  function draw(job) {
    clearTimeout(timer);
    const { phase, error, bytes, received } = job;
    const fetching = phase === 'downloading' || phase === 'verifying';
    const active = fetching || phase === 'ready' || phase === 'installing';
    const percent = bytes ? Math.floor(received * 100 / bytes) : null;
    const messages = {
      downloading: percent === null ? '正在连接发布服务器…' : `正在下载更新 · ${percent}%`,
      verifying: '正在校验并准备安装…',
      ready: '下载和校验完成。可以重启并安装。',
      installing: '正在安装，软件会自动重新连接…',
      installed: `已更新到 v${job.version}`,
      'rolled-back': '新版未能启动，已恢复旧版。',
      error: '更新未完成。',
    };
    status.hidden = !messages[phase];
    status.textContent = [messages[phase], error].filter(Boolean).join(' ');
    progress.hidden = !fetching;
    if (percent === null) progress.removeAttribute('value');
    else progress.value = percent;
    if (download) download.hidden = active || phase === 'installed';
    install.hidden = phase !== 'ready';
    install.disabled = false;
    if (restarting && phase === 'installed') { location.reload(); return; }
    if (restarting && ['rolled-back', 'error'].includes(phase)) restarting = false;
    box.querySelector('[data-u=recheck]').disabled = restarting;
    if (fetching || restarting || phase === 'installing') timer = setTimeout(poll, 650);
  }

  async function poll() {
    if (!box.isConnected && !restarting) return;
    if (restarting && Date.now() > restartDeadline) {
      restarting = false;
      draw({ phase: 'error', error: '软件暂未重新连接，请稍后从快捷方式打开。' });
      return;
    }
    try {
      draw(await api.appUpdateStatus());
    } catch (error) {
      if (restarting) timer = setTimeout(poll, 850);
    }
  }

  if (download) download.onclick = async () => {
    draw({ phase: 'downloading' });
    try { draw(await api.appUpdateDownload(version)); }
    catch (error) { draw({ phase: 'error', error: error.message }); }
  };
  install.onclick = async () => {
    install.disabled = true;
    restarting = true;
    restartDeadline = Date.now() + 60000;
    try { draw(await api.appUpdateInstall()); }
    catch (error) { restarting = false; draw({ phase: 'error', error: error.message }); }
  };
  void poll();
}

/* 供视图调用 */
export const App = {
  go,
  loadArchive,
  loadUserData,
  reloadArchives,
  setCrumbs,
  renderSide,
  markSideActive,
  updateNoteCount,
  archiveCache,
  updateHeader,
  openUpdateBox,
  emit,
  state,
};

window.__fuyanApp = App;
boot();
