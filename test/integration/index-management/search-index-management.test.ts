import { expect } from 'chai';

import {
  type Collection,
  type CommandStartedEvent,
  type MongoClient,
  MongoError
} from '../../mongodb';

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
      it('should include write concern or read concern in command - TODO(NODE-6047)', async function () {
        await client
          .withSession(session => {
            return session.withTransaction(
              async () => {
                expect(session.transaction.isStarting).to.equal(true);
                expect(session.transaction.isActive).to.equal(true);
                try {
                  const res = collection.listSearchIndexes({ session });
                  await res.toArray();
                } catch (e) {
                  // uncomment following assertion after NODE-6047 is completed
                  // expect(e.errmsg).to.match(/^.*Atlas.*$/);
                } finally {
                  // uncomment following assertion after NODE-6047 is completed
                  // expect(commandStartedEvents[0]).to.exist;
                  if (commandStartedEvents[0]) {
                    // flip following assertion after NODE-6047 is completed
                    expect(commandStartedEvents[0]?.command?.readConcern).to.exist;
                    expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
                  }
                }
              },
              { readConcern: 'local', writeConcern: { w: 1 } }
            );
          })
          .catch(function (error) {
            expect(error).to.be.an.instanceof(MongoError);
            return error;
          });
      });
    });

    context('when listSearchIndexes operation is run with causalConsistency', function () {
      it('should include write concern or read concern in command - TODO(NODE-6047)', async function () {
        await client.withSession({ causalConsistency: true }, async session => {
          try {
            const res = collection.listSearchIndexes({ session });
            await res.toArray();
          } catch (e) {
            // uncomment following assertion after NODE-6047 is completed
            // expect(e.errmsg).to.match(/^.*Atlas.*$/);
          } finally {
            // uncomment following assertion after NODE-6047 is completed
            // expect(commandStartedEvents[0]).to.exist;
            if (commandStartedEvents[0]) {
              expect(commandStartedEvents[0]?.command?.readConcern).to.not.exist;
              expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
            }
          }
        });
      });
    });

    context('when listSearchIndexes operation is run with snapshot on', function () {
      // TODO(NODE-6047): Ignore read/write concern in applySession for Atlas Search Index Helpers
      it('should include write concern or read concern in command - TODO(NODE-6047)', async function () {
        await client.withSession({ snapshot: true }, async session => {
          try {
            const res = collection.listSearchIndexes({ session });
            await res.toArray();
          } catch (e) {
            // uncomment following assertion after NODE-6047 is completed
            // expect(e.errmsg).to.match(/^.*Atlas.*$/);
          } finally {
            // uncomment following assertion after NODE-6047 is completed
            // expect(commandStartedEvents[0]).to.exist;
            if (commandStartedEvents[0]) {
              // flip following assertion after NODE-6047 is completed
              expect(commandStartedEvents[0]?.command?.readConcern).to.exist;
              expect(commandStartedEvents[0]?.command?.writeConcern).to.not.exist;
            }
          }
        });
      });
    });
  });
});
