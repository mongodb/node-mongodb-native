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

describe.only('Explain', function () {
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
        await collection.findOneAndDelete({ a: 1 }, { explain })
    },
    {
      name: 'findOne',
      op: async (explain: boolean | string) => await collection.findOne({ a: 1 }, { explain })
    },
    { name: 'find', op: (explain: boolean | string) => collection.find({ a: 1 }).explain(explain) },
    {
      name: 'findOneAndReplace',
      op: async (explain: boolean | string) =>
        await collection.findOneAndReplace({ a: 1 }, { a: 2 }, { explain })
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
    context(`When explain is ${explainValue}`, function () {
      for (const op of ops) {
        const name = op.name;
        it(`${name} returns ${explainValueToExpectation(explainValue)}`, async function () {
          const response = await op.op(explainValue).catch(error => error);
          const commandStartedEvent = await commandStartedPromise;
          switch (explainValue) {
            case true:
            case 'allPlansExecution':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('allPlansExecution');
              if (name === 'aggregate') {
                if (response.stages) {
                  expect(response.stages[0]).to.have.property('queryPlanner');
                  expect(response.stages[0]).nested.property('executionStats.allPlansExecution').to
                    .exist;
                } else {
                  expect(response[0]).to.have.property('queryPlanner');
                  expect(response[0]).nested.property('executionStats.allPlansExecution').to.exist;
                }
              } else {
                expect(response).to.have.property('queryPlanner');
                expect(response).nested.property('executionStats.allPlansExecution').to.exist;
              }
              break;
            case false:
            case 'queryPlanner':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('queryPlanner');
              if (name === 'aggregate') {
                if (response.stages) {
                  expect(response.stages[0]).to.have.property('queryPlanner');
                  expect(response.stages[0]).to.not.have.property('executionStats');
                } else {
                  expect(response[0]).to.have.property('queryPlanner');
                  expect(response[0]).to.not.have.property('executionStats');
                }
              } else {
                expect(response).to.have.property('queryPlanner');
                expect(response).to.not.have.property('executionStats');
              }
              break;
            case 'executionStats':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('executionStats');
              if (name === 'aggregate') {
                if (response.stages) {
                  expect(response.stages[0]).to.have.property('queryPlanner');
                  expect(response.stages[0]).to.have.property('executionStats');
                  expect(response.stages[0]).to.not.have.nested.property(
                    'executionStats.allPlansExecution'
                  );
                } else {
                  expect(response[0]).to.have.property('queryPlanner');
                  expect(response[0]).to.have.property('executionStats');
                  expect(response[0]).to.not.have.nested.property(
                    'executionStats.allPlansExecution'
                  );
                }
              } else {
                expect(response).to.have.property('queryPlanner');
                expect(response).to.have.property('executionStats');
                expect(response).to.not.have.nested.property('executionStats.allPlansExecution');
              }
              break;
            default:
              // for invalid values of explain
              expect(response).to.be.instanceOf(MongoServerError);
              break;
          }
        });
      }
    });
  }
});

function explainValueToExpectation(explainValue: boolean | string) {
  switch (explainValue) {
    case true:
    case 'allPlansExecution':
      return 'allPlansExecution property';
    case false:
    case 'queryPlanner':
      return 'queryPlanner property';
    case 'executionStats':
      return 'executionStats property';
    default:
      return 'error';
  }
}
