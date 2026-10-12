const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFileServices } = require('../cloudfunctions/studio/files');
test('cloud attachment ownership/env verified before download', async () => {
  let called = 0;
  const f = createFileServices({ downloadFile: async () => { called++; } }, 'env-one');
  for (const fileId of ['cloud://env-one.bucket/private/someone_else/a.pdf', 'cloud://evil.bucket/private/author/a.pdf', 'https://evil/a.pdf', 'cloud://env-one.bucket/frozen/author/a.pdf']) await assert.rejects(f.validateFiles('author', [{ fileId, name: 'a.pdf', size: 10 }]), e => e.code === 'FILE_OWNERSHIP');
  assert.equal(called, 0);
});
test('cloud saves server-controlled frozen copy and records actual size and hash', async () => {
  let saved;
  const f = createFileServices({ downloadFile: async () => ({ fileContent: Buffer.from('pdf contents') }), uploadFile: async args => { saved = args; return { fileID: 'cloud://env-one.bucket/' + args.cloudPath }; } }, 'env-one');
  const [file] = await f.validateFiles('author', [{ fileId: 'cloud://env-one.bucket/private/author/abc.pdf', name: '作品.pdf', size: 999 }]);
  assert(saved.cloudPath.startsWith('frozen/author/')); assert.equal(file.size, 12); assert.equal(file.sha256.length, 64); assert(file.fileId.includes('/frozen/'));
});
test('cloud temporary URL failures fail closed', async () => {
  const f = createFileServices({ getTempFileURL: async () => ({ fileList: [{ fileID: 'a', status: -1 }] }) }, 'env');
  await assert.rejects(f.fileLinks([{ fileId: 'a', name: 'a.pdf', size: 1 }]), e => e.code === 'FILE_UNAVAILABLE');
});
