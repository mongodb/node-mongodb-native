import { expect } from 'chai';

import { type Collection, type CommandStartedEvent, type MongoClient } from '../../mongodb';

describe(
  'Transaction cursor inherited CSOT',
  { requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.4' } },
  function () {
    let client: MongoClient;
    let collection: Collection<{ _id: number }>;
    let commands: CommandStartedEvent[];

    beforeEach(async function () {
      client = this.configuration.newClient(undefined, { monitorCommands: true });
      collection = client.db('transaction_cursor_csot').collection('records');
      await collection.deleteMany({});
      await collection.insertMany(Array.from({ length: 250 }, (_, index) => ({ _id: index })));
      commands = [];
      client.on('commandStarted', event => commands.push(event));
    });

    afterEach(async function () {
      try {
        await collection.drop();
      } finally {
        await client.close();
      }
    });

    for (const cursorKind of ['find', 'aggregate'] as const) {
      for (const budgetSource of ['withTransaction', 'session'] as const) {
        it(`pages ${cursorKind} under a ${budgetSource} timeout and commits`, async function () {
          const session = client.startSession(
            budgetSource === 'session' ? { defaultTimeoutMS: 30_000 } : {}
          );
          try {
            await session.withTransaction(
              async () => {
                const cursor =
                  cursorKind === 'find'
                    ? collection.find({}, { session, batchSize: 50 }).sort({ _id: 1 })
                    : collection.aggregate<{ _id: number }>([{ $sort: { _id: 1 } }], {
                        session,
                        batchSize: 50
                      });
                expect((await cursor.toArray()).map(document => document._id)).to.deep.equal(
                  Array.from({ length: 250 }, (_, index) => index)
                );
                await collection.insertOne({ _id: 250 }, { session });
              },
              budgetSource === 'withTransaction' ? { timeoutMS: 30_000 } : {}
            );
            const getMores = commands.filter(event => event.commandName === 'getMore');
            expect(getMores.length).to.be.greaterThan(0);
            for (const event of getMores) {
              expect(event.command.autocommit).to.equal(false);
              expect(event.command).not.to.have.property('maxTimeMS');
            }
            const initial = commands.find(event => event.commandName === cursorKind);
            expect(initial.command.maxTimeMS).to.be.greaterThan(0);
            expect(commands.some(event => event.commandName === 'commitTransaction')).to.equal(
              true
            );
            expect(await collection.countDocuments({ _id: 250 })).to.equal(1);
          } finally {
            await session.endSession();
          }
        });
      }
    }
  }
);
