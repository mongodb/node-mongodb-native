let snappy;
try {
  snappy = require('snappy');
} catch (error) {
  snappy = {
    uncompressSync(data) {
      console.warn('fake snappy uncompressSync call');
      return data;
    },
    compressSync(data) {
      console.warn('fake snappy compressSync call');
      return data;
    }
  };
}

module.exports = { snappy };
