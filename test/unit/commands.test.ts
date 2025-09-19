import { expect } from 'chai';
import * as sinon from 'sinon';

import * as compression from '../../src/cmap/wire_protocol/compression';
import { compress, Compressor, uncompressibleCommands } from '../../src/cmap/wire_protocol/compression';
import { OpCompressedRequest, OpMsgRequest, OpQueryRequest } from '../../src/cmap/commands';
import { OP_MSG, OP_QUERY } from '../../src/cmap/wire_protocol/constants';

describe('class OpCompressedRequest', () => {
  context('canCompress()', () => {
    for (const command of uncompressibleCommands) {
      it(`returns true when the command is ${command}`, () => {
        const msg = new OpMsgRequest('db', { [command]: 1 }, {});
        expect(OpCompressedRequest.canCompress(msg)).to.be.false;
      });
    }

    it(`returns true for a compressable command`, () => {
      const msg = new OpMsgRequest('db', { find: 1 }, {});
      expect(OpCompressedRequest.canCompress(msg)).to.be.true;
    });
  });

  context('toBin()', () => {
    for (const protocol of [OpMsgRequest, OpQueryRequest]) {
      context(`when ${protocol.name} is used`, () => {
        let msg;
        const serializedFindCommand = Buffer.concat(
          new protocol('db', { find: 1 }, { requestId: 1 }).toBin()
        );
        let expectedCompressedCommand;
        let compressedCommand;

        beforeEach(async () => {
          msg = new protocol('db', { find: 1 }, { requestId: 1 });
          expectedCompressedCommand = await compress(
            { agreedCompressor: 'snappy', zlibCompressionLevel: 0 },
            serializedFindCommand.slice(16)
          );
          compressedCommand = await new OpCompressedRequest(msg, {
            agreedCompressor: 'snappy',
            zlibCompressionLevel: 0
          }).toBin();
        });
        afterEach(() => sinon.restore());

        it('returns an array of buffers', async () => {
          expect(compressedCommand).to.be.a('array');
          expect(compressedCommand).to.have.lengthOf(3);
        });

        it('constructs a new message header for the request', async () => {
          const messageHeader = compressedCommand[0];
          expect(messageHeader.byteLength, 'message header is incorrect length').to.equal(16);
          expect(
            messageHeader.readInt32LE(),
            'message header reports incorrect message length'
          ).to.equal(16 + 9 + expectedCompressedCommand.length);
          expect(messageHeader.readInt32LE(4), 'requestId incorrect').to.equal(1);
          expect(messageHeader.readInt32LE(8), 'responseTo incorrect').to.equal(0);
          expect(messageHeader.readInt32LE(12), 'opcode is not OP_COMPRESSED').to.equal(2012);
        });

        it('constructs the compression details for the request', async () => {
          const compressionDetails = compressedCommand[1];
          expect(compressionDetails.byteLength, 'incorrect length').to.equal(9);
          expect(compressionDetails.readInt32LE(), 'op code incorrect').to.equal(
            protocol === OpMsgRequest ? OP_MSG : OP_QUERY
          );
          expect(
            compressionDetails.readInt32LE(4),
            'uncompressed message length incorrect'
          ).to.equal(serializedFindCommand.length - 16);
          expect(compressionDetails.readUint8(8), 'compressor incorrect').to.equal(
            Compressor['snappy']
          );
        });

        it('compresses the command', async () => {
          const compressedMessage = compressedCommand[2];
          expect(compressedMessage).to.deep.equal(expectedCompressedCommand);
        });

        it('respects the zlib compression level', async () => {
          const spy = sinon.spy(compression, 'compress');
          const [messageHeader] = await new OpCompressedRequest(msg, {
            agreedCompressor: 'snappy',
            zlibCompressionLevel: 3
          }).toBin();

          expect(messageHeader.readInt32LE(12), 'opcode is not OP_COMPRESSED').to.equal(2012);

          expect(spy).to.have.been.called;

          expect(spy.args[0][0]).to.deep.equal({
            agreedCompressor: 'snappy',
            zlibCompressionLevel: 3
          });
        });
      });
    }
  });
});

describe('OpMsgRequest', () => {
  describe('#constructor', () => {
    context('when writeConcern = 0', () => {
      it('moreToCome is set to true', async () => {
        const request = new OpMsgRequest('db', { a: 1, writeConcern: { w: 0 } }, {});
        expect(request.moreToCome).to.be.true;
      });
    });
  });
});
