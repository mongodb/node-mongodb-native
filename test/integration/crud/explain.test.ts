'use strict';
const { setupDatabase } = require('../shared');
const { MongoServerError } = require('../../mongodb');
const chai = require('chai');

const expect = chai.expect;

describe('Explain', function () {
  let client;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should honor boolean explain with delete one', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithDeleteOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.deleteOne({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain with delete many', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithDeleteMany');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.deleteMany({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain with update one', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithUpdateOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.updateOne(
          { a: 1 },
          { $inc: { a: 2 } },
          { explain: true },
          (err, explanation) => {
            expect(err).to.not.exist;
            expect(explanation).to.exist;
            expect(explanation).property('queryPlanner').to.exist;
            done();
          }
        );
      });
    }
  });

  it('should honor boolean explain with update many', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithUpdateMany');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.updateMany(
          { a: 1 },
          { $inc: { a: 2 } },
          { explain: true },
          (err, explanation) => {
            expect(err).to.not.exist;
            expect(explanation).to.exist;
            expect(explanation).nested.property('queryPlanner').to.exist;
            done();
          }
        );
      });
    }
  });

  it('should honor boolean explain with remove one', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithRemoveOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.deleteOne({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain with remove many', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithRemoveMany');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.deleteMany({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain with distinct', {
    metadata: {
      requires: {
        mongodb: '>=3.2'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithDistinct');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.distinct('a', {}, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain with findOneAndModify', {
    metadata: {
      requires: {
        mongodb: '>=3.2'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorBooleanExplainWithFindOneAndModify');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.findOneAndDelete({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should use allPlansExecution as true explain verbosity', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldUseAllPlansExecutionAsTrueExplainVerbosity');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of allPlansExecution output
        collection.deleteOne({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
          done();
        });
      });
    }
  });

  it('should use queryPlanner as false explain verbosity', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldUseQueryPlannerAsFalseExplainVerbosity');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of queryPlanner output
        collection.deleteOne({ a: 1 }, { explain: false }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).to.not.have.property('executionStats');
          done();
        });
      });
    }
  });

  it('should honor queryPlanner string explain', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorQueryPlannerStringExplain');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of queryPlanner output
        collection.deleteOne({ a: 1 }, { explain: 'queryPlanner' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).to.not.have.property('executionStats');
          done();
        });
      });
    }
  });

  it('should honor executionStats string explain', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorExecutionStatsStringExplain');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of executionStats output
        collection.deleteMany({ a: 1 }, { explain: 'executionStats' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).property('executionStats').to.exist;
          expect(explanation.executionStats).to.not.have.property('allPlansExecution');
          done();
        });
      });
    }
  });

  it('should honor allPlansExecution string explain', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorAllPlansStringExplain');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of allPlansExecution output
        collection.deleteOne({ a: 1 }, { explain: 'allPlansExecution' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
          done();
        });
      });
    }
  });

  it('should honor string explain with distinct', {
    metadata: {
      requires: {
        mongodb: '>=3.2'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorStringExplainWithDistinct');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.distinct('a', {}, { explain: 'executionStats' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).property('executionStats').to.exist;
          done();
        });
      });
    }
  });

  it('should honor string explain with findOneAndModify', {
    metadata: {
      requires: {
        mongodb: '>=3.2'
      }
    },
    test: function (done) {
      var db = client.db('shouldHonorStringExplainWithFindOneAndModify');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.findOneAndReplace(
          { a: 1 },
          { a: 2 },
          { explain: 'queryPlanner' },
          (err, explanation) => {
            expect(err).to.not.exist;
            expect(explanation).to.exist;
            expect(explanation).property('queryPlanner').to.exist;
            done();
          }
        );
      });
    }
  });

  it('should honor boolean explain with find', async () => {
    const db = client.db('shouldHonorBooleanExplainWithFind');
    const collection = db.collection('test');

    await collection.insertOne({ a: 1 });
    const [explanation] = await collection.find({ a: 1 }, { explain: true }).toArray();
    expect(explanation).to.exist;
    expect(explanation).property('queryPlanner').to.exist;
  });

  it('should honor string explain with find', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      const db = client.db('shouldHonorStringExplainWithFind');
      const collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.find({ a: 1 }, { explain: 'executionStats' }).toArray((err, docs) => {
          expect(err).to.not.exist;
          const explanation = docs[0];
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).property('executionStats').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain with findOne', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      const db = client.db('shouldHonorBooleanExplainWithFindOne');
      const collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.findOne({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor string explain with findOne', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      const db = client.db('shouldHonorStringExplainWithFindOne');
      const collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.findOne({ a: 1 }, { explain: 'executionStats' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).property('executionStats').to.exist;
          done();
        });
      });
    }
  });

  it('should honor boolean explain specified on cursor with find', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      const db = client.db('shouldHonorBooleanExplainSpecifiedOnCursor');
      const collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.find({ a: 1 }).explain(false, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    }
  });

  it('should honor string explain specified on cursor with find', {
    metadata: {
      requires: {
        mongodb: '>=3.0'
      }
    },
    test: function (done) {
      const db = client.db('shouldHonorStringExplainSpecifiedOnCursor');
      const collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.find({ a: 1 }).explain('allPlansExecution', (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).property('executionStats').to.exist;
          done();
        });
      });
    }
  });

  it('should honor legacy explain with find', {
    metadata: {
      requires: {
        mongodb: '<3.0'
      }
    },
    test: function (done) {
      const db = client.db('shouldHonorLegacyExplainWithFind');
      const collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.find({ a: 1 }).explain((err, result) => {
          expect(err).to.not.exist;
          expect(result).to.have.property('allPlans');
          done();
        });
      });
    }
  });

  it('should honor boolean explain with aggregate', async function () {
    const db = client.db('shouldHonorBooleanExplainWithAggregate');
    const collection = db.collection('test');
    await collection.insertOne({ a: 1 });
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

  it('should honor string explain with aggregate', {
    metadata: {
      requires: {
        mongodb: '>=3.6.0'
      }
    },
    test: async function () {
      const db = client.db('shouldHonorStringExplainWithAggregate');
      const collection = db.collection('test');

      await collection.insertOne({ a: 1 });
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
    }
  });

  it('should honor boolean explain specified on cursor with aggregate', async function () {
    const db = client.db('shouldHonorBooleanExplainSpecifiedOnCursor');
    const collection = db.collection('test');

    await collection.insertOne({ a: 1 });
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

  it('should honor string explain specified on cursor with aggregate', {
    metadata: {
      requires: {
        mongodb: '>=3.6'
      }
    },
    test: async function () {
      const db = client.db('shouldHonorStringExplainSpecifiedOnCursor');
      const collection = db.collection('test');

      await collection.insertOne({ a: 1 });
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
    }
  });

  it('should honor legacy explain with aggregate', async function () {
    const db = client.db('shouldHonorLegacyExplainWithAggregate');
    const collection = db.collection('test');

    await collection.insertOne({ a: 1 });
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

  it('should throw a catchable error with invalid explain string', {
    metadata: {
      requires: {
        mongodb: '>=3.4'
      }
    },
    test: async function () {
      const db = client.db('shouldThrowCatchableError');
      const collection = db.collection('test');
      try {
        await collection.find({ a: 1 }).explain('invalidExplain');
        expect.fail(new Error('Expected explain to fail but it succeeded'));
      } catch (e) {
        expect(e).to.exist;
        expect(e).to.be.instanceOf(MongoServerError);
      }
    }
  });
});
