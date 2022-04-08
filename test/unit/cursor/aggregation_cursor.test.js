'use strict';

const { expect } = require('chai');
const mock = require('../../tools/mongodb-mock/index');
const { Long } = require('bson');
const { MongoDBNamespace, isHello } = require('../../../src/utils');
const { AggregationCursor } = require('../../../src/cursor/aggregation_cursor');
const { MongoClient } = require('../../../src');

const test = {
  get uri() {
    return `mongodb://${this.server.hostAddress().toString()}`;
  }
};
describe('Aggregation Cursor', function () {
  describe('#next', function () {
    afterEach(function () {
      mock.cleanup();
    });
    beforeEach(async function () {
      test.server = await mock.createServer();
    });

    context('when there is a data bearing server', function () {
      beforeEach(function () {
        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (isHello(doc)) {
            request.reply(mock.HELLO);
          } else if (doc.aggregate) {
            request.reply({
              cursor: {
                id: Long.fromNumber(1),
                ns: 'test.test',
                firstBatch: [{ _id: 1, name: 'test' }]
              },
              ok: 1
            });
          }
        });
      });

      it('sets the session on the cursor', function (done) {
        const client = new MongoClient(test.uri);
        const cursor = new AggregationCursor(
          client,
          MongoDBNamespace.fromString('test.test'),
          [],
          {}
        );
        client.connect(function () {
          cursor.next(function () {
            expect(cursor.session).to.exist;
            client.close(done);
          });
        });
      });
    });

    context('when there is no data bearing server', function () {
      beforeEach(function () {
        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (isHello(doc)) {
            request.reply({ errmsg: 'network error' });
          } else if (doc.aggregate) {
            request.reply({
              cursor: {
                id: Long.fromNumber(1),
                ns: 'test.test',
                firstBatch: [{ _id: 1, name: 'test' }]
              },
              ok: 1
            });
          }
        });
      });

      it('does not set the session on the cursor', function (done) {
        const client = new MongoClient(test.uri, {
          serverSelectionTimeoutMS: 1000
        });
        const cursor = new AggregationCursor(
          client,
          MongoDBNamespace.fromString('test.test'),
          [],
          {}
        );
        client.connect(function () {
          cursor.next(function () {
            expect(cursor.session).to.not.exist;
            client.close(done);
          });
        });
      });
    });

    context('when a data bearing server becomes available', function () {
      beforeEach(function () {
        // Set the count of times hello has been called.
        let helloCalls = 0;
        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (isHello(doc)) {
            // After the first hello call errors indicating no data bearing server is
            // available, any subsequent hello call should succeed after server selection.
            // This gives us a data bearing server available for the next call.
            request.reply(helloCalls > 0 ? mock.HELLO : { errmsg: 'network error' });
            helloCalls++;
          } else if (doc.aggregate) {
            request.reply({
              cursor: {
                id: Long.fromNumber(1),
                ns: 'test.test',
                firstBatch: [{ _id: 1, name: 'test' }]
              },
              ok: 1
            });
          }
        });
      });

      it('sets the session on the cursor', function (done) {
        const client = new MongoClient(test.uri, {
          serverSelectionTimeoutMS: 1000
        });
        const cursor = new AggregationCursor(
          client,
          MongoDBNamespace.fromString('test.test'),
          [],
          {}
        );
        client.connect(function () {
          cursor.next(function () {
            expect(cursor.session).to.exist;
            client.close(done);
          });
        });
      });
    });
  });
});
