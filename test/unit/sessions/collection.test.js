'use strict';
const { Timestamp } = require('bson');
const { expect } = require('chai');
const mock = require('mongodb-mock-server');

const test = {};
describe('Sessions', function () {
  describe('Collection', function () {
    afterEach(() => mock.cleanup());
    beforeEach(() => {
      return mock.createServer().then(server => {
        test.server = server;
      });
    });

    it('should include `afterClusterTime` in read command with causal consistency', {
      metadata: { requires: { topology: 'single' } },

      test: function () {
        let findCommand;
        let insertOperationTime = Timestamp.fromNumber(Date.now());
        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(
              Object.assign({ logicalSessionTimeoutMinutes: 15 }, mock.DEFAULT_ISMASTER_36)
            );
          } else if (doc.insert) {
            request.reply({ ok: 1, operationTime: insertOperationTime });
          } else if (doc.find) {
            findCommand = doc;
            request.reply({ ok: 1, cursor: { id: 0, firstBatch: [] } });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);
        return client.connect().then(client => {
          const session = client.startSession({ causalConsistency: true });
          const coll = client.db('foo').collection('bar');

          return coll
            .insert({ a: 42 }, { session: session })
            .then(() => coll.findOne({}, { session: session, readConcern: { level: 'majority' } }))
            .then(() => {
              expect(findCommand.readConcern).to.have.keys(['level', 'afterClusterTime']);
              expect(findCommand.readConcern.afterClusterTime).to.eql(insertOperationTime);

              session.endSession({ skipCommand: true });
              return client.close();
            });
        });
      }
    });

    it('does not mutate command options', {
      metadata: { requires: { topology: 'single' } },

      test: function () {
        const options = Object.freeze({});
        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(mock.DEFAULT_ISMASTER_36);
          } else if (doc.count || doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);
        return client.connect().then(client => {
          const coll = client.db('foo').collection('bar');

          return coll.count({}, options).then(() => {
            expect(options).to.deep.equal({});
            return client.close();
          });
        });
      }
    });
  });
});
