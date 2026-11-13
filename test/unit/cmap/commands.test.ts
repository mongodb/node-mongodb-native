import * as BSON from 'bson';
import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { readInt32LE } from '../../../src/bson';
import {
  Compressor,
  decompress,
  DocumentSequence,
  makeDocumentSequence,
  OpCompressedRequest,
  OpMsgRequest,
  OpReply
} from '../../mongodb';

// Helper to decode UTF-8 string from Uint8Array
function utf8Slice(buffer: Uint8Array, start: number, end: number): string {
  return BSON.ByteUtils.toUTF8(buffer, start, end, false);
}

describe('commands', function () {
  describe('OpMsgRequest', function () {
    describe('#toBin', function () {
      /**
       * Note that #toBin returns an array of buffers, in this case we are interested in
       * the buffers from index 3 of the array, which hold all the document sequence sections.
       */
      context('when the command has document sequences', function () {
        context('when there is one document sequence', function () {
          const command = {
            test: 1,
            field: new DocumentSequence('field', [{ test: 1 }])
          };
          const msg = new OpMsgRequest('admin', command, {});
          const buffers = msg.toBin();
          const sequences = Buffer.concat(buffers.slice(3));

          it('keeps the first section as type 0', function () {
            // The type byte for the first section is at index 1.
            expect(buffers[1][0]).to.equal(0);
          });

          it('does not serialize the document sequences in the first section', function () {
            // Buffer at index 2 is the type 0 section - one document.
            expect(BSON.deserialize(buffers[2])).to.deep.equal({ test: 1, $db: 'admin' });
          });

          it('removes the document sequence fields from the command', function () {
            expect(command).to.not.haveOwnProperty('field');
          });

          it('sets the document sequence section type to 1', function () {
            // First byte is a one byte type.
            expect(sequences[0]).to.equal(1);
          });

          it('sets the length of the document sequence', function () {
            // Bytes starting at index 1 is a 4 byte length.
            expect(readInt32LE(sequences, 1)).to.equal(25);
          });

          it('sets the name of the first field to be replaced', function () {
            // Bytes starting at index 5 is the field name.
            expect(utf8Slice(sequences, 5, 10)).to.equal('field');
          });
        });

        context('when there are multiple document sequences', function () {
          const command = {
            test: 1,
            fieldOne: new DocumentSequence('fieldOne', [{ test: 1 }]),
            fieldTwo: new DocumentSequence('fieldTwo', [{ test: 1 }])
          };
          const msg = new OpMsgRequest('admin', command, {});
          const buffers = msg.toBin();
          const sequences = Buffer.concat(buffers.slice(3));

          it('keeps the first section as type 0', function () {
            // The type byte for the first section is at index 1.
            expect(buffers[1][0]).to.equal(0);
          });

          it('does not serialize the document sequences in the first section', function () {
            // Buffer at index 2 is the type 0 section - one document.
            expect(BSON.deserialize(buffers[2])).to.deep.equal({ test: 1, $db: 'admin' });
          });

          it('removes the document sequence fields from the command', function () {
            expect(command).to.not.haveOwnProperty('fieldOne');
            expect(command).to.not.haveOwnProperty('fieldTwo');
          });

          it('sets the document sequence sections first type to 1', function () {
            // First byte is a one byte type.
            expect(sequences[0]).to.equal(1);
          });

          it('sets the length of the first document sequence', function () {
            // Bytes starting at index 1 is a 4 byte length.
            expect(readInt32LE(sequences, 1)).to.equal(28);
          });

          it('sets the name of the first field to be replaced', function () {
            // Bytes starting at index 5 is the field name.
            expect(utf8Slice(sequences, 5, 13)).to.equal('fieldOne');
          });

          it('sets the document sequence sections second type to 1', function () {
            // First byte is a one byte type.
            expect(sequences[29]).to.equal(1);
          });

          it('sets the length of the second document sequence', function () {
            // Bytes starting at index 1 is a 4 byte length.
            expect(readInt32LE(sequences, 30)).to.equal(28);
          });

          it('sets the name of the second field to be replaced', function () {
            // Bytes starting at index 33 is the field name.
            expect(utf8Slice(sequences, 34, 42)).to.equal('fieldTwo');
          });
        });
      });

      context('wire format', function () {
        /** Encodes an OP_MSG as specified, one section after the other. */
        function encodeOpMsg(
          requestId: number,
          body: BSON.Document,
          sequences: Array<[string, BSON.Document[]]>
        ): Buffer {
          const sections = [Buffer.from([0]), Buffer.from(BSON.serialize(body))];
          for (const [field, documents] of sequences) {
            const name = Buffer.from(`${field}\0`, 'utf8');
            const docs = documents.map(doc => Buffer.from(BSON.serialize(doc)));
            const size = Buffer.alloc(4);
            size.writeInt32LE(4 + name.length + docs.reduce((total, doc) => total + doc.length, 0));
            sections.push(Buffer.from([1]), size, name, ...docs);
          }
          const header = Buffer.alloc(20);
          const message = Buffer.concat([header, ...sections]);
          message.writeInt32LE(message.length, 0);
          message.writeInt32LE(requestId, 4);
          message.writeInt32LE(2013, 12);
          return message;
        }

        const documents = (count: number) =>
          Array.from({ length: count }, (_, i) => ({ _id: i, name: `doc ${i}`, tags: ['a', 'b'] }));

        const cases: Array<{
          name: string;
          command: () => BSON.Document;
          body: BSON.Document;
          sequences: Array<[string, BSON.Document[]]>;
        }> = [
          {
            name: 'a command without document sequences',
            command: () => ({ find: 'coll', filter: { a: 1 } }),
            body: { find: 'coll', filter: { a: 1 }, $db: 'db' },
            sequences: []
          },
          {
            name: 'a command with one document sequence',
            command: () => ({
              insert: 'coll',
              documents: makeDocumentSequence(
                'documents',
                documents(3),
                documents(3).map(doc => BSON.serialize(doc))
              )
            }),
            body: { insert: 'coll', $db: 'db' },
            sequences: [['documents', documents(3)]]
          },
          {
            name: 'a command with multiple document sequences',
            command: () => ({
              bulkWrite: 1,
              ops: new DocumentSequence('ops', documents(2)),
              nsInfo: new DocumentSequence('nsInfo', [{ ns: 'db.coll' }])
            }),
            body: { bulkWrite: 1, $db: 'db' },
            sequences: [
              ['ops', documents(2)],
              ['nsInfo', [{ ns: 'db.coll' }]]
            ]
          },
          {
            name: 'a command with an empty document sequence',
            command: () => ({ insert: 'coll', documents: new DocumentSequence('documents') }),
            body: { insert: 'coll', $db: 'db' },
            sequences: [['documents', []]]
          }
        ];

        for (const { name, command, body, sequences } of cases) {
          it(`encodes ${name}`, function () {
            const msg = new OpMsgRequest('db', command(), { requestId: 7 });
            expect(Buffer.concat(msg.toBin())).to.deep.equal(encodeOpMsg(7, body, sequences));
          });

          for (const compressor of ['zlib', 'snappy'] as const) {
            it(`encodes ${name} compressed with ${compressor}`, async function () {
              const msg = new OpMsgRequest('db', command(), { requestId: 7 });
              const [header, details, compressed] = await new OpCompressedRequest(msg, {
                agreedCompressor: compressor,
                zlibCompressionLevel: 6
              }).toBin();
              const expected = encodeOpMsg(7, body, sequences);

              expect(readInt32LE(header, 0)).to.equal(16 + 9 + compressed.length);
              expect(readInt32LE(header, 12)).to.equal(2012);
              expect(readInt32LE(details, 0)).to.equal(2013);
              expect(readInt32LE(details, 4)).to.equal(expected.length - 16);
              expect(
                Buffer.from(await decompress(Compressor[compressor], compressed))
              ).to.deep.equal(expected.subarray(16));
            });
          }
        }
      });
    });
  });

  describe('Response', function () {
    describe('#parse', function () {
      context('when the message body is invalid', function () {
        context('when the buffer is empty', function () {
          const message = Buffer.from([]);
          const header = {
            length: 0,
            requestId: 0,
            responseTo: 0,
            opCode: 0
          };
          const body = Buffer.from([]);

          it('throws an exception', function () {
            const response = new OpReply(message, header, body);
            expect(() => response.parse()).to.throw(/outside buffer bounds/);
          });
        });

        context('when numReturned is invalid', function () {
          const message = Buffer.from([]);
          const header = {
            length: 0,
            requestId: 0,
            responseTo: 0,
            opCode: 0
          };
          const body = Buffer.alloc(5 * 4);
          body.writeInt32LE(-1, 16);

          it('throws an exception', function () {
            const response = new OpReply(message, header, body);
            expect(() => response.parse()).to.throw(/Invalid array length/i);
          });
        });
      });
    });

    describe('#constructor', function () {
      context('when the message body is invalid', function () {
        const message = Buffer.from([]);
        const header = {
          length: 0,
          requestId: 0,
          responseTo: 0,
          opCode: 0
        };
        const body = Buffer.from([]);

        it('does not throw an exception', function () {
          let error;
          try {
            new OpReply(message, header, body);
          } catch (err) {
            error = err;
          }
          expect(error).to.be.undefined;
        });

        it('initializes the sections to an empty array', function () {
          const response = new OpReply(message, header, body);
          expect(response.sections).to.be.empty;
        });

        it('does not set the responseFlags', function () {
          const response = new OpReply(message, header, body);
          expect(response.responseFlags).to.be.undefined;
        });

        it('does not set the cursorNotFound flag', function () {
          const response = new OpReply(message, header, body);
          expect(response.cursorNotFound).to.be.undefined;
        });

        it('does not set the cursorId', function () {
          const response = new OpReply(message, header, body);
          expect(response.cursorId).to.be.undefined;
        });

        it('does not set startingFrom', function () {
          const response = new OpReply(message, header, body);
          expect(response.startingFrom).to.be.undefined;
        });

        it('does not set numberReturned', function () {
          const response = new OpReply(message, header, body);
          expect(response.numberReturned).to.be.undefined;
        });

        it('does not set queryFailure', function () {
          const response = new OpReply(message, header, body);
          expect(response.queryFailure).to.be.undefined;
        });

        it('does not set shardConfigStale', function () {
          const response = new OpReply(message, header, body);
          expect(response.shardConfigStale).to.be.undefined;
        });

        it('does not set awaitCapable', function () {
          const response = new OpReply(message, header, body);
          expect(response.awaitCapable).to.be.undefined;
        });
      });
    });
  });
});
