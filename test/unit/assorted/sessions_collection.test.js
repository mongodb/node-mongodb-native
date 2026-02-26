'use strict';
const { Timestamp } = require('bson');
const { expect } = require('chai');
const mock = require('../../tools/mongodb-mock/index');
const { isHello } = require('../../mongodb');
const { MongoClient } = require('../../mongodb');

const test = {};
describe('Sessions - unit/sessions', function () {
  describe('Collection', function () {
    afterEach(() => mock.cleanup());

    beforeEach(() => {
      return mock.createServer().then(server => {
        test.server = server;
      });
    });

    it('should include `afterClusterTime` in read command with causal consistency', function () {
      let findCommand;
      let insertOperationTime = Timestamp.fromNumber(Date.now());
      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({ logicalSessionTimeoutMinutes: 15 }, mock.HELLO));
        } else if (doc.insert) {
          request.reply({ ok: 1, operationTime: insertOperationTime });
        } else if (doc.find) {
          findCommand = doc;
          request.reply({ ok: 1, cursor: { id: 0n, firstBatch: [] } });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
      const session = client.startSession({ causalConsistency: true });
      const coll = client.db('foo').collection('bar');

      return coll
        .insertOne({ a: 42 }, { session: session })
        .then(() => coll.findOne({}, { session: session, readConcern: { level: 'majority' } }))
        .then(() => {
          expect(findCommand.readConcern).to.have.keys(['level', 'afterClusterTime']);
          expect(findCommand.readConcern.afterClusterTime).to.eql(insertOperationTime);

          session.endSession({ skipCommand: true });
          return client.close();
        });
    });
  });
});
