const { expect } = require('chai');
const { client, handler } = require('./aws_handler');

describe('AWS Lambda Examples', function () {
  describe('#handler', function () {
    describe('when using aws environment variable authentication', function () {
      let response;

      before(async function () {
        response = await handler();
      });

      after(async function () {
        await client.close();
      });

      it('returns the databases', async function () {
        expect(response.databases).to.exist;
      });

      it('returns the status code', async function () {
        expect(response.statusCode).to.equal(200);
      });
    });
  });
});
