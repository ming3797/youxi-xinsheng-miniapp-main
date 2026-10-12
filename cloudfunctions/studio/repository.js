const crypto = require('node:crypto');
const COLLECTION = 'opera_records';
const docId = id => crypto.createHash('sha256').update(String(id)).digest('hex');
const clean = value => { if (!value) return null; const { _id, _openid, ...rest } = value; return rest; };
function createCloudRepository(db) {
  function adapter(source) {
    return {
      get: async id => {
        const result = await source.collection(COLLECTION).doc(docId(id)).get();
        return clean(result.data);
      },
      set: async (id, data) => source.collection(COLLECTION).doc(docId(id)).set({ data: clean(data) })
    };
  }
  return {
    ...adapter(db),
    list: async (kind, filters) => {
      const result = await db.collection(COLLECTION).where({ kind, ...filters }).orderBy('createdAt', 'desc').limit(200).get();
      return result.data.map(clean);
    },
    transact: callback => db.runTransaction(tx => callback(adapter(tx)))
  };
}
module.exports = { createCloudRepository };
