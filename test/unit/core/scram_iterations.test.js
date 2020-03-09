'use strict';

const { expect } = require('chai');
const mock = require('mongodb-mock-server');
const { Topology } = require('../../../lib/sdam/topology');
const { Buffer } = require('safe-buffer');
const { MongoCredentials } = require('../../../lib/cmap/auth/mongo_credentials');

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

    const client = new Topology(test.server.uri(), { credentials });
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

  it('should error if server digest is invalid', function(_done) {
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
          payload: Buffer.from(
            'r=VNnXkRqKflB5+rmfnFiisCWzgDLzez02iRpbvE5mQjMvizb+VkSPRZZ/pDmFzLxq,s=dZTyOb+KZqoeTFdsULiqow==,i=10000'
          )
        });
      } else if (doc.saslContinue) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from('v=bWFsaWNpb3VzbWFsaWNpb3VzVzV')
        });
      }
    });

    const client = new Topology(test.server.uri(), { credentials });
    client.on('error', err => {
      expect(err).to.not.be.null;
      expect(err)
        .to.have.property('message')
        .that.matches(/Server returned an invalid signature/);

      client.destroy(done);
    });

    client.connect();
  });

  it('should properly handle network errors on `saslContinue`', function(_done) {
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
          payload: Buffer.from(
            'r=VNnXkRqKflB5+rmfnFiisCWzgDLzez02iRpbvE5mQjMvizb+VkSPRZZ/pDmFzLxq,s=dZTyOb+KZqoeTFdsULiqow==,i=10000'
          )
        });
      } else if (doc.saslContinue) {
        request.connection.destroy();
      }
    });

    const client = new Topology(test.server.uri(), { credentials });
    client.on('error', err => {
      expect(err).to.not.be.null;
      expect(err)
        .to.have.property('message')
        .that.matches(/connection(.+)closed/);

      client.destroy(done);
    });

    client.connect();
  });
});
