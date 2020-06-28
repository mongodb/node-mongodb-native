'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const Server = require('../../../src/core/topologies/server');
const { MongoWriteConcernError } = require('../../../src/error');
const sinon = require('sinon');

const test = {};
describe('Pool (unit)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should throw a MongoWriteConcernError when a writeConcernError is present', function(done) {
    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        return request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.insert) {
        return request.reply({
          ok: 1,
          writeConcernError: {
            code: 64,
            codeName: 'WriteConcernFailed',
            errmsg: 'waiting for replication timed out',
            errInfo: {
              wtimeout: true
            }
          }
        });
      }
    });

    const client = new Server(test.server.address());
    client.on('error', done);
    client.once('connect', () => {
      client.insert('fake.ns', { a: 1 }, (err, result) => {
        expect(err).to.exist;
        expect(result).to.not.exist;
        expect(err).to.be.instanceOf(MongoWriteConcernError);
        client.destroy();
        done();
      });
    });

    client.connect();
  });

  it('should not allow overriding `slaveOk` when connected to a mongos', function(done) {
    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(Object.assign({ msg: 'isdbgrid' }, mock.DEFAULT_ISMASTER));
      } else if (doc.insert) {
        request.reply({ ok: 1 });
      }
    });

    const client = new Server(test.server.address());
    client.on('error', done);
    client.once('connect', () => {
      const poolWrite = sinon.spy(client.s.pool, 'write');

      client.insert('fake.ns', { a: 1 }, { slaveOk: true }, err => {
        expect(err).to.not.exist;

        const query = poolWrite.getCalls()[0].args[0];
        expect(query.slaveOk).to.be.false;

        client.s.pool.write.restore();
        client.destroy();
        done();
      });
    });

    client.connect();
  });
});
