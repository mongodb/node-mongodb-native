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
            expect(data).to.not.deep.equal(buffer);
            done();
          });
        });
      });

      context('when a level is provided', function () {
        const options = { options: { agreedCompressor: 'zstd', zstdCompressionLevel: 2 } };

        it('compresses the data', function (done) {
          compress(options, buffer, (error, data) => {
            expect(error).to.not.exist;
            expect(data).to.not.deep.equal(buffer);
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
