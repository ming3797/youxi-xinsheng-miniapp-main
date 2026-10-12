const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const parent = path.dirname(root);
const sourceZip = path.join(parent, '有戏新声_微信小程序开发版_v0.2.0.zip');
const previewZip = path.join(parent, '有戏新声_本地体验版_v0.2.0.zip');
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.DS_Store', 'project.private.config.json'].includes(item.name) || item.name.startsWith('.env') && item.name !== '.env.example') continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (!/\.(zip|png|crdownload)$/.test(item.name)) files.push(path.relative(root, full));
  }
}
walk(root);
cp.execFileSync('/usr/bin/zip', ['-q', sourceZip, ...files], { cwd: root });
cp.execFileSync('/usr/bin/zip', ['-q', previewZip, '有戏新声_开发体验版.html'], { cwd: path.join(root, 'dist') });
for (const file of [sourceZip, previewZip]) cp.execFileSync('/usr/bin/unzip', ['-t', file], { stdio: 'pipe' });
const report = [sourceZip, previewZip, path.join(root, 'dist/有戏新声_开发体验版.html')].map(file => ({ file, bytes: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
fs.writeFileSync(path.join(root, 'qa/交付文件校验.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
