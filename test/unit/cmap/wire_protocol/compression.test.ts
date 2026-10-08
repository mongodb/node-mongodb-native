import * as zstd from '@mongodb-js/zstd';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as zlib from 'zlib';

import { compress, Compressor, decompress, getZstdLibrary } from '../../../mongodb';

const hasBuiltInZstd =
  typeof zlib.zstdCompress === 'function' && typeof zlib.zstdDecompress === 'function';

describe('compression', function () {
  describe('.compress()', function () {
    context('when the compression library is zstd', function () {
      const buffer = Buffer.from('test', 'utf8');

      context('when a level is not provided', function () {
        const options = { agreedCompressor: 'zstd' as const, zlibCompressionLevel: 0 };

        it('produces data that @mongodb-js/zstd can decompress', async function () {
          const data = await compress(options, buffer);
          // decompress throws if the message is not zstd compressed
          expect(await zstd.decompress(Buffer.from(data))).to.deep.equal(buffer);
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

      it('decompresses data compressed by @mongodb-js/zstd', async function () {
        const data = await zstd.compress(buffer, 3);
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

describe('getZstdLibrary()', function () {
  const buffer = Buffer.from('test', 'utf8');

  afterEach(function () {
    sinon.restore();
  });

  context('when Node.js provides built-in zstd', function () {
    beforeEach(function () {
      if (!hasBuiltInZstd) {
        this.skip();
      }
    });

    it('prefers the built-in implementation over @mongodb-js/zstd', async function () {
      const builtInCompress = sinon.spy(zlib, 'zstdCompress');
      const builtInDecompress = sinon.spy(zlib, 'zstdDecompress');
      const addonCompress = sinon.spy(zstd, 'compress');
      const addonDecompress = sinon.spy(zstd, 'decompress');

      const library = getZstdLibrary();
      if ('kModuleError' in library) throw library.kModuleError;
      const compressed = await library.compress(buffer, 3);
      expect(await library.decompress(compressed)).to.deep.equal(buffer);

      expect(builtInCompress).to.have.been.calledOnce;
      expect(builtInDecompress).to.have.been.calledOnce;
      expect(addonCompress).to.not.have.been.called;
      expect(addonDecompress).to.not.have.been.called;
    });

    it('passes the compression level to the built-in implementation', async function () {
      const builtInCompress = sinon.spy(zlib, 'zstdCompress');

      const library = getZstdLibrary();
      if ('kModuleError' in library) throw library.kModuleError;
      await library.compress(buffer, 7);

      expect(builtInCompress.firstCall.args[1]).to.deep.equal({
        params: { [zlib.constants.ZSTD_c_compressionLevel]: 7 }
      });
    });
  });

  context('when Node.js does not provide built-in zstd', function () {
    beforeEach(function () {
      // Node.js versions before 22.15.0 have no built-in zstd, so there is nothing to hide
      if (hasBuiltInZstd) {
        sinon.stub(zlib, 'zstdCompress').value(undefined);
        sinon.stub(zlib, 'zstdDecompress').value(undefined);
      }
    });

    it('falls back to @mongodb-js/zstd', async function () {
      const addonCompress = sinon.spy(zstd, 'compress');
      const addonDecompress = sinon.spy(zstd, 'decompress');

      const library = getZstdLibrary();
      if ('kModuleError' in library) throw library.kModuleError;
      const compressed = await library.compress(buffer, 3);
      expect(await library.decompress(compressed)).to.deep.equal(buffer);

      expect(addonCompress).to.have.been.calledOnceWith(buffer, 3);
      expect(addonDecompress).to.have.been.calledOnce;
    });
  });
});
