const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const json = f => JSON.parse(read(f));
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', 'dist', 'qa'].includes(entry.name)) continue; const p = path.join(dir, entry.name); entry.isDirectory() ? walk(p) : files.push(p); } }
walk(root);
for (const file of files) {
  if (/\.(c?js)$/.test(file)) cp.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
}
const app = json('miniprogram/app.json');
for (const page of app.pages) {
  const js = read(`miniprogram/${page}.js`), wxml = read(`miniprogram/${page}.wxml`);
  const allowedTags = new Set(['view', 'text', 'button', 'input', 'textarea', 'picker', 'checkbox', 'checkbox-group', 'label', 'slider', 'block']);
  for (const match of wxml.matchAll(/<\/?([a-z][a-z0-9-]*)\b/g)) assert(allowedTags.has(match[1]), `Unsupported native component ${page}: ${match[1]}`);
  const stack = [];
  for (const match of wxml.matchAll(/<\/?([a-z][a-z0-9-]*)(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    const token = match[0];
    if (token.startsWith('</')) assert.equal(stack.pop(), match[1], `Unbalanced WXML in ${page}`);
    else if (!token.endsWith('/>')) stack.push(match[1]);
  }
  assert.equal(stack.length, 0, `Unclosed WXML tags in ${page}`);
  for (const match of wxml.matchAll(/(?:bind|catch)(?:tap|input|change|submit)="(\w+)"/g)) assert(new RegExp(`\\b${match[1]}\\s*\\(`).test(js), `Missing handler ${page}: ${match[1]}`);
}
for (const file of ['core.js', 'model.js']) assert.equal(read(`miniprogram/lib/${file}`), read(`cloudfunctions/studio/lib/${file}`), 'Shared cloud code is stale; run build');
assert.deepEqual(json('cloud/database.rules.json'), { read: false, write: false });
assert(!/<script[^>]+src=|<link[^>]+href=/i.test(read('dist/有戏新声_开发体验版.html')), 'Offline file has external dependencies');
if (process.argv.includes('--release')) {
  const config = require(path.join(root, 'miniprogram/config.js')), project = json('project.config.json');
  const missing = [];
  if (config.mode !== 'cloud') missing.push('切换 config.mode 为 cloud');
  if (!config.cloudEnv) missing.push('填写真实云环境 ID');
  if (!/^wx[0-9a-f]{16}$/.test(project.appid)) missing.push('填写真实微信 AppID');
  if (!config.agreementsApproved || config.operatorName.includes('待填写') || config.contact.includes('待填写')) missing.push('确认运营主体、客服及正式协议');
  if (missing.length) { console.error('尚不能正式提审：\n- ' + missing.join('\n- ')); process.exit(2); }
  console.log('静态提审前检查通过；仍需真机、云权限、模型和备案实际验收。');
} else console.log(`静态检查通过：${app.pages.length} 个原生页面，脚本语法、事件绑定、JSON与离线文件均有效。`);
