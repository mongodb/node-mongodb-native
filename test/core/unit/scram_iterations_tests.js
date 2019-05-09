'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const Server = require('../../../lib/topologies/server');
const Buffer = require('safe-buffer').Buffer;
const MongoCredentials = require('../../../lib/auth/mongo_credentials').MongoCredentials;

describe('SCRAM Iterations Tests', function() {
  const test = {};

  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  afterEach(() => mock.cleanup());

  it('should error if iteration count is less than 4096', function(_done) {
    const scramResponse =
      'r=IE+xNFeOcslsupAA+zkDVzHd5HfwoRuP7Wi8S4py+erf8PcNm7XIdXQyT52Nj3+M,s=AzomrlMs99A7oFxDLpgFvVb+CSvdyXuNagoWVw==,i=4000';

    const credentials = new MongoCredentials({
      mechanism: 'default',
      source: 'db',
      username: 'user',
      password: 'pencil'
    });

    let done = e => {
      done = () => {};
      return _done(e);
    };

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        return request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.saslStart) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from(scramResponse)
        });
      } else if (doc.saslContinue) {
        done('SHOULD NOT BE HERE');
      }
    });

    const client = new Server(Object.assign({}, test.server.address(), { credentials }));
    client.on('error', err => {
      let testErr;
      try {
        expect(err).to.not.be.null;
        expect(err)
          .to.have.property('message')
          .that.matches(/Server returned an invalid iteration count/);
      } catch (e) {
        testErr = e;
      }
      client.destroy();
      done(testErr);
    });

    client.connect();
  });
});
