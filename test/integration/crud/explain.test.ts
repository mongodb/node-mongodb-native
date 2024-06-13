import { expect } from 'chai';
import { once } from 'events';

import {
  type Collection,
  type CommandStartedEvent,
  type Db,
  type MongoClient,
  MongoServerError
} from '../../mongodb';

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
