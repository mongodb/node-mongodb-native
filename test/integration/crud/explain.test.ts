import { expect } from 'chai';
import { once } from 'events';

import { type Collection, type Db, type MongoClient, MongoServerError } from '../../mongodb';

const explain = [true, false, 'queryPlanner', 'allPlansExecution', 'executionStats', 'invalid'];

describe.only('Explain', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;
  const ops = [
    async (explain: boolean | string) => collection.deleteOne({ a: 1 }, { explain }),
    async (explain: boolean | string) => collection.deleteMany({ a: 1 }, { explain }),
    async (explain: boolean | string) =>
      collection.updateOne({ a: 1 }, { $inc: { a: 2 } }, { explain }),
    async (explain: boolean | string) =>
      collection.updateMany({ a: 1 }, { $inc: { a: 2 } }, { explain }),
    async (explain: boolean | string) => collection.distinct('a', {}, { explain }),
    async (explain: boolean | string) => collection.findOneAndDelete({ a: 1 }, { explain }),
    async (explain: boolean | string) => collection.findOne({ a: 1 }, { explain }),
    async (explain: boolean | string) => collection.find({ a: 1 }, { explain }),
    async (explain: boolean | string) =>
      collection.findOneAndReplace({ a: 1 }, { a: 2 }, { explain }),
    async (explain: boolean | string) =>
      collection
        .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }], { explain })
        .toArray()
  ];

  const opNames = [
    'deleteOne',
    'deleteMany',
    'updateOne',
    'updateMany',
    'distinct',
    'findOneAndDelete',
    'findOne',
    'find',
    'aggregate'
  ];

  const testTable: {
    op: (explain: boolean | string) => Promise<any>;
    explainValue: string | boolean;
  }[] = explain.flatMap(explainValue => {
    return ops.flatMap(op => {
      return { op, explainValue };
    });
  });

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    db = client.db('queryPlannerExplainResult');
    collection = db.collection('test');
    await collection.insertOne({ a: 1 });
  });

  afterEach(async function () {
    await collection.drop();
    await client.close();
  });

  testTable.forEach(function (test) {
    context(`When explain is ${test.explainValue}`, function () {
      it(`${
        opNames[ops.indexOf(test.op)]
      } returns ${explainValueToExpectation(test.op, test.explainValue)}`, async function () {
        const commandStartedPromise = once(client, 'commandStartedEvent');
        const response = await test.op(test.explainValue);
        const commandStartedEvent = await commandStartedPromise;
        expect(commandStartedEvent[0].explain).to.have.property(`${test.op.name}`);
        switch (test.explainValue) {
          case true:
          case 'allPlansExecution':
            expect(commandStartedEvent[0].verbosity).to.be.equal('allPlansExecution');
            expect(response).to.have.property('queryPlanner');
            expect(response).nested.property('executionStats.allPlansExecution').to.exist;
            break;
          case false:
          case 'queryPlanner':
            expect(commandStartedEvent[0].verbosity).to.be.equal('queryPlanner');
            expect(response).to.have.property('queryPlanner');
            break;
          case 'executionStats':
            expect(commandStartedEvent[0].verbosity).to.be.equal('executionStats');
            expect(response).to.have.property('queryPlanner');
            expect(response).to.have.property('executionStats');
            expect(response).nested.property('allPlansExecution').to.not.exist;
            break;
          default:
            expect(response).to.be.instanceOf(MongoServerError);
            break;
        }
      });
    });
  });
  /*
  context('highest verbosity explain', () => {
    it('deleteOne returns queryPlanner explain result', async function () {
      const explanation = await collection.deleteOne({ a: 1 }, { explain: true });
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('deleteMany returns queryPlanner explain result', async function () {
      const explanation = await collection.deleteMany({ a: 1 }, { explain: true });
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('updateOne returns queryPlanner explain result', async function () {
      const explanation = await collection.updateOne(
        { a: 1 },
        { $inc: { a: 2 } },
        { explain: true }
      );
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('updateMany returns queryPlanner explain result', async function () {
      const explanation = await collection.updateMany(
        { a: 1 },
        { $inc: { a: 2 } },
        { explain: true }
      );
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('distinct returns queryPlanner explain result', async function () {
      const explanation = await collection.distinct('a', {}, { explain: true });
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('findOneAndDelete returns queryPlanner explain result', async function () {
      const explanation = await collection.findOneAndDelete({ a: 1 }, { explain: true });
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('allPlansExecution returns verbose queryPlanner explain result', async function () {
      const explanation = await collection.deleteOne({ a: 1 }, { explain: true });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
    });

    it('findOne returns queryPlanner explain result', async function () {
      const explanation = await collection.findOne({ a: 1 }, { explain: true });
      expect(explanation).property('queryPlanner').to.exist;
    });

    it('find returns queryPlanner explain result', async () => {
      const [explanation] = await collection.find({ a: 1 }, { explain: true }).toArray();
      expect(explanation).property('queryPlanner').to.exist;
    });
  });

  context('lowest verbosity explain', () => {
    it('deleteOne only returns queryPlanner property in explain result', async function () {
      const explanation = await collection.deleteOne({ a: 1 }, { explain: false });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).to.not.have.property('executionStats');
    });

    it('find returns "queryPlanner" explain result specified on cursor', async function () {
      const explanation = await collection.find({ a: 1 }).explain(false);
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).to.not.have.property('executionStats');
    });
  });

  context('when explain is set to "queryPlanner"', () => {
    it('deleteOne returns only queryPlanner property in explain result', async function () {
      const explanation = await collection.deleteOne({ a: 1 }, { explain: 'queryPlanner' });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).to.not.have.property('executionStats');
    });

    it('findOneAndReplace returns queryPlanner explain result', async function () {
      const explanation = await collection.findOneAndReplace(
        { a: 1 },
        { a: 2 },
        { explain: 'queryPlanner' }
      );
      expect(explanation).property('queryPlanner').to.exist;
    });
  });

  context('when explain is set to "executionStats"', () => {
    it('"executionStats" property is used in explain result', async function () {
      const explanation = await collection.deleteMany({ a: 1 }, { explain: 'executionStats' });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).property('executionStats').to.exist;
      expect(explanation).to.not.have.nested.property('executionStats.allPlansExecution');
    });

    it('distinct returns executionStats explain result', async function () {
      const explanation = await collection.distinct('a', {}, { explain: 'executionStats' });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).property('executionStats').to.exist;
    });

    it('find returns executionStats explain result', async function () {
      const [explanation] = await collection
        .find({ a: 1 }, { explain: 'executionStats' })
        .toArray();
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).property('executionStats').to.exist;
    });

    it('findOne returns executionStats explain result', async function () {
      const explanation = await collection.findOne({ a: 1 }, { explain: 'executionStats' });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).property('executionStats').to.exist;
    });
  });

  context('when explain is set to "allPlansExecution"', () => {
    it('allPlansExecution property is used in explain result', async function () {
      const explanation = await collection.deleteOne({ a: 1 }, { explain: 'allPlansExecution' });
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).property('executionStats').to.exist;
      expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
    });

    it('find returns allPlansExecution explain result specified on cursor', async function () {
      const explanation = await collection.find({ a: 1 }).explain('allPlansExecution');
      expect(explanation).property('queryPlanner').to.exist;
      expect(explanation).property('executionStats').to.exist;
    });
  });

  context('aggregate()', () => {
    it('when explain is set to true, aggregate result returns queryPlanner and executionStats properties', async function () {
      const aggResult = await collection
        .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }], { explain: true })
        .toArray();

      if (aggResult[0].stages) {
        expect(aggResult[0].stages).to.have.length.gte(1);
        expect(aggResult[0].stages[0]).to.have.property('$cursor');
        expect(aggResult[0].stages[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult[0].stages[0].$cursor).to.have.property('executionStats');
      } else if (aggResult[0].$cursor) {
        expect(aggResult[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult[0].$cursor).to.have.property('executionStats');
      } else {
        expect(aggResult[0]).to.have.property('queryPlanner');
        expect(aggResult[0]).to.have.property('executionStats');
      }
    });

    it('when explain is set to "executionStats", aggregate result returns queryPlanner and executionStats properties', async function () {
      const aggResult = await collection
        .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }], {
          explain: 'executionStats'
        })
        .toArray();
      if (aggResult[0].stages) {
        expect(aggResult[0].stages).to.have.length.gte(1);
        expect(aggResult[0].stages[0]).to.have.property('$cursor');
        expect(aggResult[0].stages[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult[0].stages[0].$cursor).to.have.property('executionStats');
      } else if (aggResult[0].$cursor) {
        expect(aggResult[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult[0].$cursor).to.have.property('executionStats');
      } else {
        expect(aggResult[0]).to.have.property('queryPlanner');
        expect(aggResult[0]).to.have.property('executionStats');
      }
    });

    it('when explain is set to false, aggregate result returns queryPlanner property', async function () {
      const aggResult = await collection
        .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }])
        .explain(false);
      if (aggResult && aggResult.stages) {
        expect(aggResult.stages).to.have.length.gte(1);
        expect(aggResult.stages[0]).to.have.property('$cursor');
        expect(aggResult.stages[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult.stages[0].$cursor).to.not.have.property('executionStats');
      } else if (aggResult.$cursor) {
        expect(aggResult.$cursor).to.have.property('queryPlanner');
        expect(aggResult.$cursor).to.not.have.property('executionStats');
      } else {
        expect(aggResult).to.have.property('queryPlanner');
        expect(aggResult).to.not.have.property('executionStats');
      }
    });

    it('when explain is set to "allPlansExecution", aggregate result returns queryPlanner and executionStats properties', async function () {
      const aggResult = await collection
        .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }])
        .explain('allPlansExecution');

      if (aggResult && aggResult.stages) {
        expect(aggResult.stages).to.have.length.gte(1);
        expect(aggResult.stages[0]).to.have.property('$cursor');
        expect(aggResult.stages[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult.stages[0].$cursor).to.have.property('executionStats');
      } else {
        expect(aggResult).to.have.property('queryPlanner');
        expect(aggResult).to.have.property('executionStats');
      }
    });

    it('when explain is not set, aggregate result returns queryPlanner and executionStats properties', async function () {
      const aggResult = await collection
        .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }])
        .explain();
      if (aggResult && aggResult.stages) {
        expect(aggResult.stages).to.have.length.gte(1);
        expect(aggResult.stages[0]).to.have.property('$cursor');
        expect(aggResult.stages[0].$cursor).to.have.property('queryPlanner');
        expect(aggResult.stages[0].$cursor).to.have.property('executionStats');
      } else {
        expect(aggResult).to.have.property('queryPlanner');
        expect(aggResult).to.have.property('executionStats');
      }
    });
  });

  context('when explain is set to an unexpected value', () => {
    it('should throw a catchable error with invalid explain string', async function () {
      const error = await collection
        .find({ a: 1 })
        .explain('invalidExplain')
        .catch(error => error);
      expect(error).to.be.instanceOf(MongoServerError);
    });
  });
  */
});

async function explainValueToExpectation(
  op: (explain: boolean | string) => Promise<any>,
  explainValue: boolean | string
) {
  const opResult = await op(explainValue);
  return opResult;
}
