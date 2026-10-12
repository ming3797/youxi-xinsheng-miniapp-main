const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// 此测试只执行离线文件的启动与模板逻辑，不替代真实浏览器渲染验收。
test('standalone HTML boots its actual bundled service and renders homepage without network dependencies', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../dist/有戏新声_开发体验版.html'), 'utf8');
  const bundle = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const classes = new Set(), storage = new Map(), elements = new Map();
  const element = key => { if (!elements.has(key)) elements.set(key, { innerHTML: '', textContent: '', hidden: false, classList: { add() {}, remove() {}, toggle() {} }, prepend() {}, setAttribute() {}, scrollIntoView() {} }); return elements.get(key); };
  const document = { body: { classList: { add: k => classes.add(k), remove: k => classes.delete(k) } }, querySelector: element, querySelectorAll: () => [], addEventListener() {}, createElement: () => element('created') };
  const context = vm.createContext({ document, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, setTimeout, clearTimeout, console, window: { scrollTo() {} } });
  vm.runInContext(bundle, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(classes.has('is-busy'), false);
  assert(element('#main').innerHTML.includes('你的故事，'));
  assert(element('#main').innerHTML.includes('归燕 · 春信'));
  assert(element('#actor').innerHTML.includes('demo_admin'));
  assert(element('#identity').textContent.includes('投稿人'));
  assert(storage.has('youxi-xinsheng-dev-v2'));
  assert(!html.includes('<script src='));
});
