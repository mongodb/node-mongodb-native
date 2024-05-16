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

    describe('when listSearchIndexes operation is run with causalConsistency', function () {
      it(
        'should not include write concern or read concern in command',
        {
          requires: {
            topology: '!single',
            mongodb: '>=7.0',
            serverless: 'forbid'
          }
        },
        async function () {
          await client.withSession({ causalConsistency: true }, async session => {
            const res = collection.listSearchIndexes({ session });
            await res.toArray().catch(e => expect(e.errmsg).to.match(/^.*Atlas.*$/));
            expect(commandStartedEvents[0]).to.exist;
            expect(commandStartedEvents[0]?.command?.readConcern).to.not.exist;
            expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
          });
        }
      );
    });

    describe('when listSearchIndexes operation is run with snapshot on', function () {
      // TODO(NODE-6047): Ignore read/write concern in applySession for Atlas Search Index Helpers
      it(
        'should include write concern or read concern in command - TODO(NODE-6047)',
        {
          requires: {
            topology: ['replicaset', 'sharded'],
            mongodb: '>=7.0',
            serverless: 'forbid'
          }
        },
        async function () {
          await client.withSession({ snapshot: true }, async session => {
            const res = collection.listSearchIndexes({ session });
            const error = await res.toArray().catch(e => e);
            expect(error.errmsg).to.match(/^.*snapshot.*$/);
            expect(commandStartedEvents[0]).to.exist;
            // flip assertion after NODE-6047 implementation
            expect(commandStartedEvents[0]?.command?.readConcern).to.exist;
            expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
          });
        }
      );
    });
  });
});
