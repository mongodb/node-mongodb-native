import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { readInt32LE, readUint8 } from '../../src/bson';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as compression from '../../src/cmap/wire_protocol/compression';
import {
  compress,
  Compressor,
  OP_MSG,
  OP_QUERY,
  OpCompressedRequest,
  OpMsgRequest,
  OpQueryRequest,
  runNodelessTests,
  uncompressibleCommands
} from '../mongodb';

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
            readInt32LE(messageHeader, 0),
            'message header reports incorrect message length'
          ).to.equal(16 + 9 + expectedCompressedCommand.length);
          expect(readInt32LE(messageHeader, 4), 'requestId incorrect').to.equal(1);
          expect(readInt32LE(messageHeader, 8), 'responseTo incorrect').to.equal(0);
          expect(readInt32LE(messageHeader, 12), 'opcode is not OP_COMPRESSED').to.equal(2012);
        });

        it('constructs the compression details for the request', async () => {
          const compressionDetails = compressedCommand[1];
          expect(compressionDetails.byteLength, 'incorrect length').to.equal(9);
          expect(readInt32LE(compressionDetails, 0), 'op code incorrect').to.equal(
            protocol === OpMsgRequest ? OP_MSG : OP_QUERY
          );
          expect(
            readInt32LE(compressionDetails, 4),
            'uncompressed message length incorrect'
          ).to.equal(serializedFindCommand.length - 16);
          expect(readUint8(compressionDetails, 8), 'compressor incorrect').to.equal(
            Compressor['snappy']
          );
        });

        it('compresses the command', async () => {
          const compressedMessage = compressedCommand[2];
          expect(compressedMessage).to.deep.equal(expectedCompressedCommand);
        });

        describe('zlib compression', function () {
          before(function () {
            if (runNodelessTests) {
              this.currentTest.skipReason =
                'This test relies on sinon spying on the compress() function, which is not currently possible in nodeless environments';
              this.currentTest.skip();
            }
          });

          it('respects the zlib compression level', async function () {
            const spy = sinon.spy(compression, 'compress');
            const [messageHeader] = await new OpCompressedRequest(msg, {
              agreedCompressor: 'snappy',
              zlibCompressionLevel: 3
            }).toBin();

            expect(readInt32LE(messageHeader, 12), 'opcode is not OP_COMPRESSED').to.equal(2012);

            expect(spy).to.have.been.called;

            expect(spy.args[0][0]).to.deep.equal({
              agreedCompressor: 'snappy',
              zlibCompressionLevel: 3
            });
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
