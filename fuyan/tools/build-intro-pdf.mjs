/**
 * 生成介绍 PDF：docs/介绍页.html → docs/复研介绍.pdf
 * 用 Edge/Chrome 的 headless 打印，A4、无页眉页脚。
 * 用法：node tools/build-intro-pdf.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argIn = process.argv[2];
const argOut = process.argv[3];
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

if (!EDGE) {
  console.error('找不到 Edge/Chrome');
  process.exit(1);
}

const html = argIn ? path.resolve(root, argIn) : path.join(root, 'docs', '介绍页.html');
const pdf = argOut ? path.resolve(root, argOut) : path.join(root, 'docs', '复研介绍.pdf');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runPrint(profile) {
  return new Promise((resolve) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-pdf-header-footer',
      `--user-data-dir=${profile}`,
      `--print-to-pdf=${pdf}`,
      '--virtual-time-budget=8000',
      'file:///' + html.replace(/\\/g, '/'),
    ];
    const child = spawn(EDGE, args, { stdio: 'ignore' });
    child.on('close', resolve);
    child.on('error', resolve);
  });
}

if (fs.existsSync(pdf)) fs.rmSync(pdf, { force: true });

for (let attempt = 1; attempt <= 2 && !fs.existsSync(pdf); attempt++) {
  await runPrint(path.join(os.tmpdir(), `fuyan-pdf-${Date.now()}-${attempt}`));
  for (let i = 0; i < 40 && !fs.existsSync(pdf); i++) await sleep(250);
}

if (!fs.existsSync(pdf)) {
  console.error('生成失败：没有产出 PDF');
  process.exit(1);
}
const kb = Math.round(fs.statSync(pdf).size / 1024);
console.log(`已生成 ${path.relative(root, pdf)} (${kb} KB)`);
