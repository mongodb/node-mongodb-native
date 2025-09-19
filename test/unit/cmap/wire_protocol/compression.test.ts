import * as zstd from '@mongodb-js/zstd';
import { expect } from 'chai';
import { compress, Compressor, decompress } from '../../../../src/cmap/wire_protocol/compression';

describe('compression', function () {
  describe('.compress()', function () {
    context('when the compression library is zstd', function () {
      const buffer = Buffer.from('test', 'utf8');

      context('when a level is not provided', function () {
        const options = { agreedCompressor: 'zstd' as const, zlibCompressionLevel: 0 };

        it('compresses the data', async function () {
          const data = await compress(options, buffer);
          // decompress throws if the message is not zstd compresed
          expect(await zstd.decompress(data)).to.deep.equal(buffer);
        });
      });
    });

    context('when the agreed compressor is zlib', () => {
      const options = { agreedCompressor: 'zlib' as const, zlibCompressionLevel: 2 };
      const input = Buffer.from('test', 'utf8');

      it('compresses input with zlib', async () => {
        const data = await compress(options, input);
        // https://www.rfc-editor.org/rfc/rfc1950 (always leads with 0x78)
        expect(data.toString('hex', 0, 1)).to.equal('78');
      });
    });

    context('when the agreed compressor is snappy', () => {
      const options = { agreedCompressor: 'snappy' as const, zlibCompressionLevel: 2 };
      const input = Buffer.from('test', 'utf8');

      it('compresses input with snappy', async () => {
        // https://github.com/google/snappy/blob/main/format_description.txt#L18
        // Snappy starts with the length of the uncompressed data in bytes
        const data = await compress(options, input);
        expect(data.toString('hex', 0, 1)).to.equal('04');
      });
    });
  });

  describe('.decompress()', function () {
    context('when the compression library is zstd', function () {
      const buffer = Buffer.from('test', 'utf8');
      const options = { agreedCompressor: 'zstd' as const, zlibCompressionLevel: 0 };

      it('decompresses the data', async function () {
        const data = await compress(options, buffer);
        const decompressed = await decompress(Compressor.zstd, data);
        expect(decompressed).to.deep.equal(buffer);
      });
    });

    context('when the input has a compressorID corresponding to zlib', () => {
      // zlib compressed string "test"
      const input = Buffer.from('785e2b492d2e0100045d01c1', 'hex');

      it('decompresses input with zlib', async () => {
        const data = await decompress(Compressor.zlib, input);
        expect(data.toString('utf8')).to.equal('test');
      });
    });

    context('when the agreed compressor is snappy', () => {
      // https://github.com/google/snappy/blob/main/format_description.txt#L18
      // 0x04 is the size, 0x0c are flags
      const input = Buffer.from('040c' + Buffer.from('test', 'utf8').toString('hex'), 'hex');

      it('decompresses input with snappy', async () => {
        const data = await decompress(Compressor.snappy, input);
        expect(data.toString('utf8')).to.equal('test');
      });
    });
  });
});
