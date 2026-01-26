import * as BSON from 'bson';
import { expect } from 'chai';

import { DocumentSequence, OpMsgRequest, OpReply } from '../../../src/cmap/commands';

describe('commands', function () {
  describe('OpMsgRequest', function () {
    describe('#toBin', function () {
      /**
       * Note that #toBin returns an array of buffers, in this case we are interested in
       * the buffer at index 3 of the array, which is a single buffer of all the
       * document sequence sections.
       */
      context('when the command has document sequences', function () {
        context('when there is one document sequence', function () {
          const command = {
            test: 1,
            field: new DocumentSequence('field', [{ test: 1 }])
          };
          const msg = new OpMsgRequest('admin', command, {});
          const buffers = msg.toBin();

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
            expect(buffers[3][0]).to.equal(1);
          });

          it('sets the length of the document sequence', function () {
            // Bytes starting at index 1 is a 4 byte length.
            expect(buffers[3].readInt32LE(1)).to.equal(25);
          });

          it('sets the name of the first field to be replaced', function () {
            // Bytes starting at index 5 is the field name.
            expect(buffers[3].toString('utf8', 5, 10)).to.equal('field');
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
            expect(buffers[3][0]).to.equal(1);
          });

          it('sets the length of the first document sequence', function () {
            // Bytes starting at index 1 is a 4 byte length.
            expect(buffers[3].readInt32LE(1)).to.equal(28);
          });

          it('sets the name of the first field to be replaced', function () {
            // Bytes starting at index 5 is the field name.
            expect(buffers[3].toString('utf8', 5, 13)).to.equal('fieldOne');
          });

          it('sets the document sequence sections second type to 1', function () {
            // First byte is a one byte type.
            expect(buffers[3][29]).to.equal(1);
          });

          it('sets the length of the second document sequence', function () {
            // Bytes starting at index 1 is a 4 byte length.
            expect(buffers[3].readInt32LE(30)).to.equal(28);
          });

          it('sets the name of the second field to be replaced', function () {
            // Bytes starting at index 33 is the field name.
            expect(buffers[3].toString('utf8', 34, 42)).to.equal('fieldTwo');
          });
        });
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
            expect(() => response.parse()).to.throw(RangeError, /outside buffer bounds/);
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
            expect(() => response.parse()).to.throw(RangeError, /Invalid array length/i);
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
