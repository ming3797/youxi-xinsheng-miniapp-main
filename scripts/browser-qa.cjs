const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const qa = path.join(root, 'qa');
async function main() {
  const modulePath = process.env.OPERA_PUPPETEER_PATH || path.resolve(root, '../../video/cohort6-ai-automation-demo/node_modules/puppeteer/lib/puppeteer/puppeteer.js');
  const { default: puppeteer } = await import(pathToFileURL(modulePath));
  await fs.mkdir(qa, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-first-run'] });
  const errors = [], checks = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  page.on('dialog', dialog => dialog.accept());
  const url = pathToFileURL(path.join(root, 'dist/有戏新声_开发体验版.html')).href;
  async function idle() { await page.waitForFunction(() => !document.body.classList.contains('is-busy')); }
  async function click(selector) { await page.waitForSelector(selector); await page.click(selector); await idle(); }
  async function nav(view) { await click(`[data-nav="${view}"]`); }
  async function role(id) { await page.select('#actor', id); await idle(); }
  async function input(selector, value) { await page.$eval(selector, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
  async function byTitle(title) { await page.evaluate(t => { const card = [...document.querySelectorAll('.work-card')].find(e => e.querySelector('h3').textContent === t); if (!card) throw new Error('Missing card: ' + t); card.click(); }, title); await idle(); }
  async function snapshot(name) {
    await page.screenshot({ path: path.join(qa, name + '.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, name + ' overflows horizontally'); checks.push(name);
  }
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'load' }); await idle(); await page.waitForSelector('.stage');
    await snapshot('01-mobile-home');
    await page.setViewport({ width: 320, height: 740 }); await snapshot('02-mobile-small');
    await page.setViewport({ width: 390, height: 844 });
    await click('[data-action="submit-page"]');
    await input('[name="title"]', '验收·春归');
    await input('[name="text"]', '檐角一声春又晚，归燕衔泥过旧关。母亲灯下缝新袖，未问归期先问寒。');
    await page.$('#files').then(el => el.uploadFile(path.join(root, 'tests/fixtures/submission.txt'))); await idle();
    await page.waitForFunction(() => document.querySelector('#file-list').textContent.includes('submission.txt'));
    for (const name of ['adult', 'original', 'reviewConsent', 'allowDisplay']) await page.click(`[name="${name}"]`);
    await click('#submit-form button[type="submit"]');
    assert((await page.$eval('#main', e => e.innerText)).includes('待受理'));
    await snapshot('03-private-submission');
    const title = '验收·春归';
    await role('demo_admin'); await click('[data-action="desk"]'); await byTitle(title);
    await page.click('[name="expertIds"][value="user_demo_expert_a"]'); await page.click('[name="expertIds"][value="user_demo_expert_b"]');
    await click('#assign-form button');
    for (const [actor, score] of [['demo_expert_a', 90], ['demo_expert_b', 92]]) {
      await role(actor); await click('[data-action="desk"]'); await byTitle(title);
      for (const field of ['originality', 'tradition', 'completeness', 'performability', 'potential']) await input(`[name="${field}"]`, String(score));
      await input('[name="comment"]', '人物关系清楚，情绪发展自然，建议第二段进一步留出气口并强化人物行动。');
      await page.click('[name="noConflict"]'); await click('#review-form button');
    }
    assert((await page.$eval('#main', e => e.innerText)).includes('评审通过')); await snapshot('04-approved-review');
    await role('demo_admin'); await click('[data-action="desk"]'); await byTitle(title);
    await input('[name="schedule"]', '开发验收：下周二晚18点示例免费培训'); await click('#incubate-form button');
    await click('[data-action="publish-work"]'); await snapshot('05-incubation-and-publication');
    await role('demo_creator'); await nav('home'); await byTitle(title);
    assert((await page.$eval('#main', e => e.innerText)).includes('孵化中'));
    await nav('create'); await page.select('[name="workType"]', 'both');
    await input('[name="title"]', '溪桥春信'); await input('[name="scene"]', '女儿多年后回到家乡，在春天与母亲重逢。');
    await page.click('[name="aiConsent"]'); await click('#generate-form button');
    await page.waitForSelector('#generated-result .notation'); await snapshot('06-generated-score');
    const session = await page.createCDPSession();
    await session.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: qa });
    await click('[data-action="export-score"]');
    await page.waitForFunction(() => true);
    for (let i = 0; i < 30; i++) { try { await fs.access(path.join(qa, '溪桥春信.musicxml')); break; } catch (_) { await new Promise(resolve => setTimeout(resolve, 100)); } }
    const xml = await fs.readFile(path.join(qa, '溪桥春信.musicxml'), 'utf8'); assert(xml.includes('AI-generated')); assert(xml.includes('<measure number="8">'));
    await click('[data-action="submit-job"]');
    assert.equal(await page.$eval('[name="title"]', e => e.value), '溪桥春信');
    assert.equal(await page.$eval('[name="aiUse"]', e => e.value), 'generated');
    assert.equal(await page.$eval('[name="original"]', e => e.checked), false);
    await role('demo_expert_a'); await nav('home'); await click('.creator-card');
    await input('#comment-form textarea', '很期待这位作者下一段作品，建议第二句再多留一点气口。'); await click('#comment-form button');
    assert(!(await page.$eval('#main', e => e.innerText)).includes('很期待这位作者下一段作品'));
    await role('demo_admin'); await click('[data-action="desk"]'); await click('[data-action="moderate"][data-value="approved"]'); await snapshot('07-operations');
    await nav('home'); await click('.creator-card'); assert((await page.$eval('#main', e => e.innerText)).includes('很期待这位作者下一段作品')); await snapshot('08-creator-comments');
    await role('demo_creator'); await nav('profile'); await snapshot('09-points-ledger');
    const points = await page.$eval('.profile-stats strong', e => e.textContent); assert.equal(points, '1660');
    await page.reload({ waitUntil: 'load' }); await idle(); await nav('works');
    assert((await page.$eval('#main', e => e.innerText)).includes('验收·春归'));
    await byTitle(title); await click('[data-action="open-file"]');
    checks.push('attachment-upload-download-and-reload-persistence');
    await nav('home'); await page.setViewport({ width: 1440, height: 1100 }); await snapshot('10-desktop-home');
    assert.deepEqual(errors, []);
    const report = { checkedAt: new Date().toISOString(), artifact: 'dist/有戏新声_开发体验版.html', openedVia: 'file://', checks, errors, note: '浏览器离线体验及共享业务逻辑验收；不等同微信开发者工具编译或真机云环境验收。' };
    await fs.writeFile(path.join(qa, 'browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
