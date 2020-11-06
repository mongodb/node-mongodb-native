'use strict';

const expect = require('chai').expect;
const { MongoError } = require('../../../src/error');
const mock = require('mongodb-mock-server');
const { Topology } = require('../../../src/sdam/topology');
const { Long } = require('bson');
const { MongoDBNamespace } = require('../../../src/utils');
const { FindCursor } = require('../../../src/cursor/find_cursor');

const test = {};
describe('Response', function () {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should throw when document is error', {
    metadata: { requires: { topology: ['single'] } },
    test: function (done) {
      const errdoc = {
        errmsg: 'Cursor not found (namespace: "liveearth.entityEvents", id: 2018648316188432590).'
      };

      const client = new Topology(test.server.address());

      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            Object.assign({}, mock.DEFAULT_ISMASTER, {
              maxWireVersion: 6
            })
          );
        } else if (doc.find) {
          request.reply({
            cursor: {
              id: Long.fromNumber(1),
              ns: 'test.test',
              firstBatch: []
            },
            ok: 1
          });
        } else if (doc.getMore) {
          request.reply(errdoc);
        }
      });

      client.on('error', done);
      client.once('connect', () => {
        const cursor = new FindCursor(client, MongoDBNamespace.fromString('test.test'), {}, {});

        // Execute next
        cursor.next(function (err) {
          expect(err).to.exist;
          expect(err).to.be.instanceof(MongoError);
          expect(err.message).to.equal(errdoc.errmsg);

          client.close(done);
        });
      });
      client.connect();
    }
  });
});
