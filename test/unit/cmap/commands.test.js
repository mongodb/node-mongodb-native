const { expect } = require('chai');
const { Response } = require('../../../src/cmap/commands');

describe('commands', function () {
  describe('Response', function () {
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
          const response = new Response(message, header, body);
          expect(response.numberReturned).to.be.undefined;
        });
      });
    });
  });
});
