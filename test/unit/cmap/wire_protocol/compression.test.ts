import { expect } from 'chai';

import { compress, Compressor, decompress } from '../../../../src/cmap/wire_protocol/compression';

describe('compression', function () {
  describe('.compress()', function () {
    context('when the compression library is zstd', function () {
      const buffer = Buffer.from('test');

      context('when a level is not provided', function () {
        const options = { options: { agreedCompressor: 'zstd' } };

        it('compresses the data', function (done) {
          compress(options, buffer, (error, data) => {
            expect(error).to.not.exist;
            const zstdMagicNumber = data.reverse().toString('hex').substring(16, 26);
            // Zstd magic number first set of bytes is is 0xFD2FB528
            expect(zstdMagicNumber).to.equal('00fd2fb528');
            done();
          });
        });
      });

      context('when a level is provided', function () {
        const options = { options: { agreedCompressor: 'zstd', zstdCompressionLevel: 2 } };

        it('compresses the data', function (done) {
          compress(options, buffer, (error, data) => {
            expect(error).to.not.exist;
            const zstdMagicNumber = data.reverse().toString('hex').substring(16, 26);
            // Zstd magic number first set of bytes is is 0xFD2FB528
            expect(zstdMagicNumber).to.equal('00fd2fb528');
            done();
          });
        });
      });
    });
  });

  describe('.decompress()', function () {
    context('when the compression library is zstd', function () {
      const buffer = Buffer.from('test');
      const options = { options: { agreedCompressor: 'zstd' } };

      it('decompresses the data', function (done) {
        compress(options, buffer, (error, data) => {
          expect(error).to.not.exist;
          decompress(Compressor.zstd, data, (err, decompressed) => {
            expect(decompressed).to.deep.equal(buffer);
            done();
          });
        });
      });
    });
  });
});
