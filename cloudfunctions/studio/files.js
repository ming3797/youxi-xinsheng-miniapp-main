const crypto = require('node:crypto');
const { DomainError, EXTENSIONS } = require('./lib/model');
function createFileServices(cloud, env) {
  return {
    validateFiles: async (actor, files) => {
      if (!env) throw new DomainError('UPLOAD_DISABLED', '云环境标识不可用');
      const output = [];
      for (const file of files) {
        const match = /^cloud:\/\/([^/]+)\/private\/([^/]+)\/([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)$/.exec(file.fileId);
        if (!match || !(match[1] === env || match[1].startsWith(env + '.')) || match[2] !== actor) throw new DomainError('FILE_OWNERSHIP', '附件不属于当前用户或云环境');
        const ext = match[3].split('.').pop().toLowerCase();
        if (!EXTENSIONS.includes(ext) || file.name.split('.').pop().toLowerCase() !== ext) throw new DomainError('FILE_TYPE', '附件扩展名不匹配');
        const downloaded = await cloud.downloadFile({ fileID: file.fileId });
        const buffer = downloaded.fileContent;
        if (!buffer || buffer.length < 1 || buffer.length > 20 * 1024 * 1024) throw new DomainError('FILE_SIZE', '每个附件需小于20MB');
        // 冻结副本由服务端创建；安全规则禁止客户端读写 frozen/。
        const snapshot = await cloud.uploadFile({ cloudPath: `frozen/${actor}/${crypto.randomBytes(16).toString('hex')}.${ext}`, fileContent: buffer });
        output.push({ fileId: snapshot.fileID, name: file.name, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
      }
      return output;
    },
    fileLinks: async files => {
      if (!files.length) return [];
      const result = await cloud.getTempFileURL({ fileList: files.map(f => ({ fileID: f.fileId, maxAge: 600 })) });
      return files.map(f => {
        const link = result.fileList.find(v => v.fileID === f.fileId && v.status === 0);
        if (!link) throw new DomainError('FILE_UNAVAILABLE', '附件暂时无法打开');
        return { name: f.name, size: f.size, fileId: f.fileId, url: link.tempFileURL };
      });
    }
  };
}
module.exports = { createFileServices };
