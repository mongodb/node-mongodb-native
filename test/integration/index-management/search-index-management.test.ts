import { expect } from 'chai';

import type { Collection, CommandStartedEvent, MongoClient } from '../../mongodb';

describe('Search Index Management Integration Tests', function () {
  describe('read concern and write concern ', function () {
    context('when operation is run withTransaction', function () {
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

      context('when operation is listSearchIndexes', function () {
        it('should not include write concern or read concern in command', async function () {
          client.withSession(session => {
            return session.withTransaction(
              async () => {
                expect(session.transaction.isStarting).to.equal(true);
                expect(session.transaction.isActive).to.equal(true);
                try {
                  const res = collection.listSearchIndexes({ session });
                  const arrayedRes = await res.toArray();
                  console.log(arrayedRes);
                } catch (e) {
                  expect(e.errmsg).to.match(/^.*Atlas.*$/);
                } finally {
                  expect(commandStartedEvents[0]).to.exist;
                  expect(commandStartedEvents[0].command.readConcern).to.not.exist;
                  expect(commandStartedEvents[0].command.writeConcern).to.not.exist;
                }
              },
              { readConcern: 'local', writeConcern: { w: 1 } }
            );
          });
        });
      });
    });
  });
});
