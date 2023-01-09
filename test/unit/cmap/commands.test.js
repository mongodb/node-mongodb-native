const { expect } = require('chai');
const { Response } = require('../../mongodb');

describe('commands', function () {
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
            const response = new Response(message, header, body);
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
            const response = new Response(message, header, body);
            expect(() => response.parse()).to.throw(RangeError, /Invalid array length/);
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
            new Response(message, header, body);
          } catch (err) {
            error = err;
          }
          expect(error).to.be.undefined;
        });

        it('initializes the documents to an empty array', function () {
          const response = new Response(message, header, body);
          expect(response.documents).to.be.empty;
        });

        it('does not set the responseFlags', function () {
          const response = new Response(message, header, body);
          expect(response.responseFlags).to.be.undefined;
        });

        it('does not set the cursorNotFound flag', function () {
          const response = new Response(message, header, body);
          expect(response.cursorNotFound).to.be.undefined;
        });

        it('does not set the cursorId', function () {
          const response = new Response(message, header, body);
          expect(response.cursorId).to.be.undefined;
        });

        it('does not set startingFrom', function () {
          const response = new Response(message, header, body);
          expect(response.startingFrom).to.be.undefined;
        });

        it('does not set numberReturned', function () {
          const response = new Response(message, header, body);
          expect(response.numberReturned).to.be.undefined;
        });

        it('does not set queryFailure', function () {
          const response = new Response(message, header, body);
          expect(response.queryFailure).to.be.undefined;
        });

        it('does not set shardConfigStale', function () {
          const response = new Response(message, header, body);
          expect(response.shardConfigStale).to.be.undefined;
        });

        it('does not set awaitCapable', function () {
          const response = new Response(message, header, body);
          expect(response.awaitCapable).to.be.undefined;
        });
      });
    });
  });
});
