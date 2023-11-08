import { BSONError, deserialize } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as compression from '../../src/cmap/wire_protocol/compression';
import {
  compress,
  Compressor,
  type MessageHeader,
  OP_MSG,
  OP_QUERY,
  OpCompressedRequest,
  OpMsgRequest,
  OpMsgResponse,
  OpQueryRequest,
  uncompressibleCommands
} from '../mongodb';

const msgHeader: MessageHeader = {
  length: 735,
  requestId: 14704565,
  responseTo: 4,
  opCode: 2013
};

// when top-level key writeErrors contains an error message that has invalid utf8
const invalidUtf8ErrorMsg =
  '0000000000ca020000106e00000000000477726974654572726f727300a50200000330009d02000010696e646578000000000010636f646500f82a0000036b65795061747465726e000f0000001074657874000100000000036b657956616c756500610100000274657874005201000064e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e298830000026572726d736700f1000000453131303030206475706c6963617465206b6579206572726f7220636f6c6c656374696f6e3a20626967646174612e7465737420696e6465783a20746578745f3120647570206b65793a207b20746578743a202264e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e2982e2e2e22207d000000016f6b00000000000000f03f00';
const msgBodyInvalidUtf8WriteErrors = Buffer.from(invalidUtf8ErrorMsg, 'hex');
const invalidUtf8ErrorMsgDeserializeInput = Buffer.from(invalidUtf8ErrorMsg.substring(10), 'hex');
const invalidUtf8InWriteErrorsJSON = {
  n: 0,
  writeErrors: [
    {
      index: 0,
      code: 11000,
      keyPattern: {
        text: 1
      },
      keyValue: {
        text: 'd☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃'
      },
      errmsg:
        'E11000 duplicate key error collection: bigdata.test index: text_1 dup key: { text: "d☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃☃�..." }'
    }
  ],
  ok: 1
};

// when another top-level key besides writeErrors has invalid utf8
const nKeyWithInvalidUtf8 =
  '0000000000cc020000026e0005000000f09f98ff000477726974654572726f727300a60200000330009e02000010696e646578000000000010636f646500f82a0000036b65795061747465726e000f0000001074657874000100000000036b657956616c756500610100000274657874005201000064e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e298830000026572726d736700f2000000453131303030206475706c6963617465206b6579206572726f7220636f6c6c656374696f6e3a20626967646174612e7465737420696e6465783a20746578745f3120647570206b65793a207b20746578743a202264e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883e29883efbfbd2e2e2e22207d000000106f6b000100000000';
const msgBodyNKeyWithInvalidUtf8 = Buffer.from(nKeyWithInvalidUtf8, 'hex');

describe('BinMsg BSON utf8 validation', () => {
  it('correctly deserializes data with replacement characters for invalid utf8 in writeErrors object', () => {
    // this is a sanity check to make sure nothing unexpected is happening in the deserialize method itself

    const options = { validation: { utf8: { writeErrors: false } as const } };
    const deserializerCall = () => deserialize(invalidUtf8ErrorMsgDeserializeInput, options);
    expect(deserializerCall()).to.deep.equals(invalidUtf8InWriteErrorsJSON);
  });

  context('when enableUtf8Validation option is not specified', () => {
    const binMsgInvalidUtf8ErrorMsg = new OpMsgResponse(
      Buffer.alloc(0),
      msgHeader,
      msgBodyInvalidUtf8WriteErrors
    );

    const options = {};
    it('does not validate the writeErrors key', () => {
      expect(() => binMsgInvalidUtf8ErrorMsg.parse(options)).to.not.throw();
    });

    it('validates keys other than the writeErrors key', () => {
      const binMsgAnotherKeyWithInvalidUtf8 = new OpMsgResponse(
        Buffer.alloc(0),
        msgHeader,
        msgBodyNKeyWithInvalidUtf8
      );
      expect(() => binMsgAnotherKeyWithInvalidUtf8.parse(options)).to.throw(
        BSONError,
        'Invalid UTF-8 string in BSON document'
      );
    });
  });

  context('when validation is disabled', () => {
    const binMsgInvalidUtf8ErrorMsg = new OpMsgResponse(
      Buffer.alloc(0),
      msgHeader,
      msgBodyInvalidUtf8WriteErrors
    );

    const options = { enableUtf8Validation: false };
    it('should not validate the writeErrors key', () => {
      expect(() => binMsgInvalidUtf8ErrorMsg.parse(options)).to.not.throw();
    });

    it('does not validate keys other than the writeErrors key', () => {
      const binMsgAnotherKeyWithInvalidUtf8 = new OpMsgResponse(
        Buffer.alloc(0),
        msgHeader,
        msgBodyNKeyWithInvalidUtf8
      );
      expect(() => binMsgAnotherKeyWithInvalidUtf8.parse(options)).to.not.throw(
        BSONError,
        'Invalid UTF-8 string in BSON document'
      );
    });
  });

  it('disables validation by default for writeErrors if no validation specified', () => {
    const binMsgInvalidUtf8ErrorMsg = new OpMsgResponse(
      Buffer.alloc(0),
      msgHeader,
      msgBodyInvalidUtf8WriteErrors
    );
    const options = {
      bsonRegExp: false,
      promoteBuffers: false,
      promoteLongs: true,
      promoteValues: true
    };

    expect(() => binMsgInvalidUtf8ErrorMsg.parse(options)).to.not.throw();
  });

  context('utf8 validation enabled', () => {
    const options = { enableUtf8Validation: true };
    it('does not validate the writeErrors key', () => {
      const binMsgInvalidUtf8ErrorMsg = new OpMsgResponse(
        Buffer.alloc(0),
        msgHeader,
        msgBodyInvalidUtf8WriteErrors
      );

      expect(() => binMsgInvalidUtf8ErrorMsg.parse(options)).not.to.throw(
        BSONError,
        'Invalid UTF-8 string in BSON document'
      );
    });

    it('validates keys other than the writeErrors key', () => {
      const binMsgAnotherKeyWithInvalidUtf8 = new OpMsgResponse(
        Buffer.alloc(0),
        msgHeader,
        msgBodyNKeyWithInvalidUtf8
      );
      expect(() => binMsgAnotherKeyWithInvalidUtf8.parse(options)).to.throw(
        BSONError,
        'Invalid UTF-8 string in BSON document'
      );
    });
  });
});

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

  context('toBin()', async () => {
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
