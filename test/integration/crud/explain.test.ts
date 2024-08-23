import { expect } from 'chai';
import { once } from 'events';
import { test } from 'mocha';

import {
  type Collection,
  type CommandStartedEvent,
  type Db,
  type MongoClient,
  MongoServerError
} from '../../mongodb';
import { filterForCommands } from '../shared';

const explain = [true, false, 'queryPlanner', 'allPlansExecution', 'executionStats', 'invalid'];

describe('CRUD API explain option', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;
  let commandStartedPromise: Promise<CommandStartedEvent[]>;
  const ops = [
    {
      name: 'deleteOne',
      op: async (explain: boolean | string) => await collection.deleteOne({ a: 1 }, { explain })
    },
    {
      name: 'deleteMany',
      op: async (explain: boolean | string) => await collection.deleteMany({ a: 1 }, { explain })
    },
    {
      name: 'updateOne',
      op: async (explain: boolean | string) =>
        await collection.updateOne({ a: 1 }, { $inc: { a: 2 } }, { explain })
    },
    {
      name: 'updateMany',
      op: async (explain: boolean | string) =>
        await collection.updateMany({ a: 1 }, { $inc: { a: 2 } }, { explain })
    },
    {
      name: 'distinct',
      op: async (explain: boolean | string) => await collection.distinct('a', {}, { explain })
    },
    {
      name: 'findOneAndDelete',
      op: async (explain: boolean | string) =>
        await collection.findOneAndDelete({ a: 1 }, { explain, includeResultMetadata: true })
    },
    {
      name: 'findOne',
      op: async (explain: boolean | string) => {
        return await collection.findOne({ a: 1 }, { explain });
      }
    },
    { name: 'find', op: (explain: boolean | string) => collection.find({ a: 1 }).explain(explain) },
    {
      name: 'findOneAndReplace',
      op: async (explain: boolean | string) =>
        await collection.findOneAndReplace(
          { a: 1 },
          { a: 2 },
          { explain, includeResultMetadata: true }
        )
    },
    {
      name: 'aggregate',
      op: async (explain: boolean | string) =>
        await collection
          .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }], { explain })
          .toArray()
    }
  ];

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    db = client.db('queryPlannerExplainResult');
    collection = db.collection('test');
    await collection.insertOne({ a: 1 });
    commandStartedPromise = once(client, 'commandStarted');
  });

  afterEach(async function () {
    await collection.drop();
    await client.close();
  });

  for (const explainValue of explain) {
    for (const op of ops) {
      const name = op.name;
      context(`When explain is ${explainValue}, operation ${name}`, function () {
        it(`sets command verbosity to ${explainValue} and includes ${explainValueToExpectation(explainValue)} in the return response`, async function () {
          const response = await op.op(explainValue).catch(error => error);
          if (response instanceof Error && !(response instanceof MongoServerError)) {
            throw response;
          }
          const commandStartedEvent = await commandStartedPromise;
          const explainJson = JSON.stringify(response);
          switch (explainValue) {
            case true:
            case 'allPlansExecution':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('allPlansExecution');
              expect(explainJson).to.include('queryPlanner');
              break;
            case false:
            case 'queryPlanner':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('queryPlanner');
              expect(explainJson).to.include('queryPlanner');
              break;
            case 'executionStats':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('executionStats');
              expect(explainJson).to.include('queryPlanner');
              break;
            default:
              // for invalid values of explain
              expect(response).to.be.instanceOf(MongoServerError);
              break;
          }
        });
      });
    }
  }

  describe('explain helpers w/ maxTimeMS', function () {
    let client: MongoClient;
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();

      client.on('commandStarted', filterForCommands('explain', commands));
      commands.length = 0;
    });

    afterEach(async function () {
      await client.close();
    });

    describe('cursor explain commands', function () {
      describe('when maxTimeMS is specified via a cursor explain method, it sets the property on the command', function () {
        test('find()', async function () {
          const collection = client.db('explain-test').collection('collection');
          await collection
            .find({ name: 'john doe' })
            .explain({ maxTimeMS: 2000, verbosity: 'queryPlanner' });

          const [{ command }] = commands;
          expect(command).to.have.property('maxTimeMS', 2000);
        });

        test('aggregate()', async function () {
          const collection = client.db('explain-test').collection('collection');

          await collection
            .aggregate([{ $match: { name: 'john doe' } }])
            .explain({ maxTimeMS: 2000, verbosity: 'queryPlanner' });

          const [{ command }] = commands;
          expect(command).to.have.property('maxTimeMS', 2000);
        });
      });

      it('when maxTimeMS is not specified, it is not attached to the explain command', async function () {
        // Create a collection, referred to as `collection`, with the namespace `explain-test.collection`.
        const collection = client.db('explain-test').collection('collection');

        await collection.find({ name: 'john doe' }).explain({ verbosity: 'queryPlanner' });

        const [{ command }] = commands;
        expect(command).not.to.have.property('maxTimeMS');
      });

      it('when maxTimeMS is specified as an explain option and a command-level option, the explain option takes precedence', async function () {
        // Create a collection, referred to as `collection`, with the namespace `explain-test.collection`.
        const collection = client.db('explain-test').collection('collection');

        await collection
          .find(
            {},
            {
              maxTimeMS: 1000,
              explain: {
                verbosity: 'queryPlanner',
                maxTimeMS: 2000
              }
            }
          )
          .toArray();

        const [{ command }] = commands;
        expect(command).to.have.property('maxTimeMS', 2000);
      });
    });

    describe('regular commands w/ explain', function () {
      it('when maxTimeMS is specified as an explain option and a command-level option, the explain option takes precedence', async function () {
        // Create a collection, referred to as `collection`, with the namespace `explain-test.collection`.
        const collection = client.db('explain-test').collection('collection');

        await collection.deleteMany(
          {},
          {
            maxTimeMS: 1000,
            explain: {
              verbosity: true,
              maxTimeMS: 2000
            }
          }
        );

        const [{ command }] = commands;
        expect(command).to.have.property('maxTimeMS', 2000);
      });

      describe('when maxTimeMS is specified as an explain option', function () {
        it('attaches maxTimeMS to the explain command', async function () {
          const collection = client.db('explain-test').collection('collection');
          await collection.deleteMany(
            {},
            { explain: { maxTimeMS: 2000, verbosity: 'queryPlanner' } }
          );

          const [{ command }] = commands;
          expect(command).to.have.property('maxTimeMS', 2000);
        });
      });

      it('when maxTimeMS is not specified, it is not attached to the explain command', async function () {
        const collection = client.db('explain-test').collection('collection');

        await collection.deleteMany({}, { explain: { verbosity: 'queryPlanner' } });

        const [{ command }] = commands;
        expect(command).not.to.have.property('maxTimeMS');
      });
    });
  });
});

function explainValueToExpectation(explainValue: boolean | string) {
  switch (explainValue) {
    case true:
    case 'allPlansExecution':
      return 'queryPlanner, executionStats, and nested allPlansExecution properties';
    case false:
    case 'queryPlanner':
      return 'only queryPlanner property';
    case 'executionStats':
      return 'queryPlanner and executionStats property';
    default:
      return 'error';
  }
}
