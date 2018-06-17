'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const Server = require('../../../lib/topologies/server');
const MongoWriteConcernError = require('../../../lib/error').MongoWriteConcernError;

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
        done();
      });
    });

    client.connect();
  });
});
