'use strict';

const https = require('https');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { createHash } = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { setTimeout: delay } = require('timers/promises');
const store = require('./store');
const update = require('./update');
const winps = require('./winps');

const MAX_PACKAGE = 256 * 1024 * 1024;
const RESULT = path.join(store.TMP_DIR, 'app-update-result.json');
const REQUIRED_CAPABILITIES = ['lesson-navigation', 'in-app-updates'];
const RELEASE = /^https:\/\/github\.com\/makainuo\/(zailao-app|fuyan-app)\/releases\/download\/v(\d+\.\d+\.\d+)\/zailao-v\2\.zip$/i;
let job = null;

function supports(remote) {
  return process.platform === 'win32' && fs.existsSync(path.join(store.APP_ROOT, 'runtime', 'node', 'node.exe'))
    && RELEASE.exec(remote?.url || '')?.[2] === remote?.version && Boolean(remote?.version);
}

function assertPortableInstall() {
  const root = store.APP_ROOT;
  const data = path.relative(fs.realpathSync(root), fs.realpathSync(store.DATA_DIR));
  if (data !== '..' && !data.startsWith('..' + path.sep) && !path.isAbsolute(data)) {
    throw new Error('用户资料位于程序目录内，当前安装不能自动替换。');
  }
  if (fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(path.dirname(root), '.git'))
      || fs.lstatSync(root).isSymbolicLink()) {
    throw new Error('请从 Windows 便携程序目录运行更新。');
  }
}

function response(url, limitMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: limitMs, headers: { 'User-Agent': 'zailao-app' } }, resolve);
    req.on('timeout', () => req.destroy(new Error('连接 GitHub 超时')));
    req.on('error', reject);
  });
}

async function releaseAsset(remote) {
  const [, repo, version] = RELEASE.exec(remote.url);
  const repositories = [...new Set([repo, 'zailao-app', 'fuyan-app'])];
  for (const name of repositories) {
    const res = await response(`https://api.github.com/repos/makainuo/${name}/releases/tags/v${version}`, 12000);
    if ([301, 302, 404].includes(res.statusCode)) { res.resume(); continue; }
    if (res.statusCode !== 200) { res.resume(); throw new Error(`读取发布校验信息失败（HTTP ${res.statusCode}）`); }
    let body = '';
    for await (const chunk of res.setEncoding('utf8')) {
      body += chunk;
      if (body.length > 1024 * 1024) throw new Error('发布信息过大');
    }
    const info = JSON.parse(body);
    const asset = info.assets?.find((item) => item.name === `zailao-v${version}.zip`);
    if (!asset || info.draft || info.prerelease || info.tag_name !== `v${version}`) continue;
    const declared = RELEASE.exec(asset.browser_download_url || '');
    const digest = /^sha256:([a-f\d]{64})$/i.exec(asset.digest || '');
    if (declared?.[2] !== version || !digest || !Number.isSafeInteger(asset.size)
        || asset.size <= 0 || asset.size > MAX_PACKAGE) {
      throw new Error('发布包缺少有效的 SHA-256 校验值或大小信息');
    }
    return { url: asset.browser_download_url, hash: digest[1].toLowerCase(), bytes: asset.size };
  }
  throw new Error('未找到对应的 Windows 正式发布包');
}

async function assetResponse(url, redirects = 0) {
  const target = new URL(url);
  const allowed = ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
  if (target.protocol !== 'https:' || target.username || target.password || target.port
      || (!RELEASE.test(url) && !allowed.includes(target.hostname))) {
    throw new Error('发布包跳转到了未经授权的下载地址');
  }
  const res = await response(target);
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
    res.resume();
    return assetResponse(new URL(res.headers.location, target).href, redirects + 1);
  }
  if (res.statusCode !== 200) { res.resume(); throw new Error(`下载发布包失败（HTTP ${res.statusCode}）`); }
  return res;
}

async function stage(remote) {
  try {
    const asset = await releaseAsset(remote);
    job.bytes = asset.bytes;
    const directory = await fsp.mkdtemp(path.join(path.dirname(store.APP_ROOT), '.zailao-update-'));
    job.directory = directory;
    const zip = path.join(directory, 'package.zip');
    const next = path.join(directory, 'next');
    const hash = createHash('sha256');
    const res = await assetResponse(asset.url);
    const meter = new Transform({
      transform(chunk, encoding, done) {
        job.received += chunk.length;
        if (job.received > job.bytes) return done(new Error('下载包大小超过发布记录'));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(res, meter, fs.createWriteStream(zip, { flags: 'wx' }));
    if (job.received !== asset.bytes || hash.digest('hex') !== asset.hash) throw new Error('下载包 SHA-256 校验失败');
    job.phase = 'verifying';
    await winps.runPS('prepare-app-update.ps1', ['-Zip', zip, '-Destination', next], { timeout: 120000 });
    const manifest = JSON.parse(await fsp.readFile(path.join(next, 'version.json'), 'utf8'));
    if (manifest.version !== remote.version || manifest.update !== remote.update
        || !Array.isArray(manifest.capabilities) || !REQUIRED_CAPABILITIES.every((key) => manifest.capabilities.includes(key))) {
      throw new Error('发布包版本不匹配，或缺少逐课导航与软件内更新能力');
    }
    for (const name of ['server.js', 'package.json', 'runtime/node/node.exe', 'web/index.html',
      'web/js/app.js', 'lib/install-update.js', 'tools/ps/install-app-update.ps1',
      'tools/ps/launch-app-update.ps1', 'tools/ps/prepare-app-update.ps1']) {
      if (!(await fsp.stat(path.join(next, name))).isFile()) throw new Error('发布包缺少 ' + name);
    }
    await fsp.unlink(zip);
    job.phase = 'ready';
  } catch (error) {
    if (job.directory) await fsp.rm(job.directory, { recursive: true, force: true }).catch(() => {});
    job.phase = 'error';
    job.error = error.message;
  }
}

async function status() {
  if (job) {
    const { phase, version, received, bytes, error } = job;
    return { phase, version, received, bytes, error };
  }
  const result = await store.readJSON(RESULT, null);
  return result || { phase: 'idle' };
}

async function start(version) {
  if (job && job.phase !== 'error') return status();
  assertPortableInstall();
  job = { phase: 'downloading', version, received: 0, bytes: 0 };
  try {
    const result = await update.check();
    if (!result.ok || !result.hasUpdate || result.remote?.version !== version || !supports(result.remote)
        || update.cmpVersion(version, result.local.version) <= 0) {
      throw new Error('未找到所选版本的 Windows 正式更新，请重新检查');
    }
    await fsp.rm(RESULT, { force: true });
    void stage(result.remote);
  } catch (error) {
    job.phase = 'error';
    job.error = error.message;
  }
  return status();
}

async function install(port) {
  if (job?.phase !== 'ready') throw new Error('更新包还未准备好');
  job.phase = 'installing';
  try {
    const work = job.directory;
    const worker = path.join(work, 'install-app-update.ps1');
    const plan = path.join(work, 'plan.json');
    await fsp.copyFile(path.join(store.APP_ROOT, 'tools', 'ps', 'install-app-update.ps1'), worker);
    await fsp.writeFile(plan, JSON.stringify({ root: store.APP_ROOT, data: store.DATA_DIR, result: RESULT,
      version: job.version, oldVersion: update.getLocal().version, port, pid: process.pid }), { flag: 'wx' });
    await winps.runPS('launch-app-update.ps1', ['-Worker', worker, '-PlanPath', plan], { timeout: 12000 });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (fs.existsSync(path.join(work, 'waiting'))) return status();
      await delay(100);
    }
    const result = await store.readJSON(RESULT, null);
    throw new Error(result?.error || '无法启动 Windows 更新程序');
  } catch (error) {
    job.phase = 'error';
    job.error = error.message;
    throw error;
  }
}

module.exports = { supports, status, start, install };
