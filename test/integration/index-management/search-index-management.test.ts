import { expect } from 'chai';

import { type Collection, type CommandStartedEvent, type MongoClient } from '../../mongodb';

describe('Search Index Management Integration Tests', function () {
  describe('read concern and write concern ', function () {
    let client: MongoClient;
    let collection: Collection;
    let commandStartedEvents: CommandStartedEvent[];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();
      collection = client.db('client').collection('searchIndexManagement');
      commandStartedEvents = [];
      client.on('commandStarted', e => commandStartedEvents.push(e));
    });

    afterEach(async function () {
      await client.close();
    });

    context('when listSearchIndexes operation is run withTransaction', function () {
      // TODO(NODE-6047): Ignore read/write concern in applySession for Atlas Search Index Helpers
      it('should include write concern or read concern in command - TODO(NODE-6047)', {
        metadata: {
          requires: {
            topology: '!single',
            mongodb: '>=7.0',
            serverless: 'forbid'
          }
        },
        test: async function () {
          let res;
          await client.withSession(async session => {
            await session
              .withTransaction(
                async function (session) {
                  res = collection.listSearchIndexes({ session });
                  await res.toArray();
                },
                { readConcern: 'local', writeConcern: { w: 1 } }
              )
              .catch(e => e);
            // expect(e.errmsg).to.match(/^.*Atlas.*$/) - uncomment after NODE-6047
            expect(commandStartedEvents[0]).to.exist;
            // flip assertion after NODE-6047 implementation
            expect(commandStartedEvents[0]?.command?.readConcern).to.exist;
            expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
          });
        }
      });
    });

    context('when listSearchIndexes operation is run with causalConsistency', function () {
      it('should not include write concern or read concern in command', {
        metadata: {
          requires: {
            topology: '!single',
            mongodb: '>=7.0',
            serverless: 'forbid'
          }
        },
        test: async function () {
          await client.withSession({ causalConsistency: true }, async session => {
            const res = collection.listSearchIndexes({ session });
            await res.toArray().catch(e => expect(e.errmsg).to.match(/^.*Atlas.*$/));
            expect(commandStartedEvents[0]).to.exist;
            expect(commandStartedEvents[0]?.command?.readConcern).to.not.exist;
            expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
          });
        }
      });
    });

    context('when listSearchIndexes operation is run with snapshot on', function () {
      // TODO(NODE-6047): Ignore read/write concern in applySession for Atlas Search Index Helpers
      it('should include write concern or read concern in command - TODO(NODE-6047)', {
        metadata: {
          requires: {
            topology: ['replicaset', 'sharded'],
            mongodb: '>=7.0',
            serverless: 'forbid'
          }
        },
        test: async function () {
          await client.withSession({ snapshot: true }, async session => {
            const res = collection.listSearchIndexes({ session });
            await res.toArray().catch(e => e);
            // expect(e.errmsg).to.match(/^.*Atlas.*$/) - uncomment after NODE-6047
            expect(commandStartedEvents[0]).to.exist;
            // flip assertion after NODE-6047 implementation
            expect(commandStartedEvents[0]?.command?.readConcern).to.exist;
            expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
          });
        }
      });
    });
  });
});
