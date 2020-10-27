'use strict';
const { setupDatabase, withClient } = require('./shared');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

describe('Explain', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('shouldHonorBooleanExplainWithRemoveOne', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorBooleanExplainWithRemoveOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.removeOne({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    })
  });

  it('shouldHonorBooleanExplainWithRemoveMany', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorBooleanExplainWithRemoveMany');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.removeMany({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    })
  });

  it('shouldHonorBooleanExplainWithUpdateOne', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
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
            expect(explanation).property('queryPlanner').to.exist; // nested result is how updateOne is returned, unfortunately
            done();
          }
        );
      });
    })
  });

  it('shouldHonorBooleanExplainWithUpdateMany', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
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
    })
  });

  it('shouldUseAllPlansExecutionAsDefaultExplainVerbosity', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldUseAllPlansExecutionAsDefaultExplainVerbosity');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of allPlansExecution output
        collection.removeOne({ a: 1 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
          done();
        });
      });
    })
  });

  it('shouldHonorQueryPlannerStringExplainWithRemoveOne', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorQueryPlannerStringExplainWithRemoveOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of queryPlanner output
        collection.removeOne({ a: 1 }, { explain: 'queryPlanner' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).to.not.have.property('executionStats');
          done();
        });
      });
    })
  });

  it('shouldHonorExecutionStatsStringExplainWithRemoveOne', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorExecutionStatsStringExplainWithRemoveOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of executionStats output
        collection.removeOne({ a: 1 }, { explain: 'executionStats' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).property('executionStats').to.exist;
          expect(explanation.executionStats).to.not.have.property('allPlansExecution');
          done();
        });
      });
    })
  });

  it('shouldHonorAllPlansStringExplainWithRemoveOne', {
    metadata: {
      requires: {
        mongodb: '>3.0'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorAllPlansStringExplainWithRemoveOne');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        // Verify explanation result contains properties of allPlansExecution output
        collection.removeOne({ a: 1 }, { explain: 'allPlansExecution' }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
          done();
        });
      });
    })
  });

  // have to skip this Or move it to a data lake testing file
  // it('shouldHonorQueryPlannerExtendedStringExplainWithRemoveOne', {
  //   metadata: {
  //     requires: {
  //       mongodb: '>3.0'
  //     }
  //   },
  //   test: withClient(function (client, done) {
  //     var db = client.db('shouldHonorQueryPlannerExtendedStringExplainWithRemoveOne');
  //     var collection = db.collection('test');

  //     collection.insertOne({ a: 1 }, (err, res) => {
  //       expect(err).to.not.exist;
  //       expect(res).to.exist;

  //       // Verify explanation result contains properties of queryPlannerExtended (treated like allPlansExecution)
  //       collection.removeOne({ a: 1 }, { explain: 'queryPlannerExtended' }, (err, explanation) => {
  //         expect(err).to.not.exist;
  //         expect(explanation).to.exist;
  //         expect(explanation).property('queryPlanner').to.exist;
  //         expect(explanation).nested.property('executionStats.allPlansExecution').to.exist;
  //         done();
  //       });
  //     });
  //   })
  // });

  it('shouldHonorBooleanExplainWithDistinct', {
    metadata: {
      requires: {
        mongodb: '>3.2'
      }
    },
    test: withClient(function (client, done) {
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
    })
  });

  it('shouldHonorBooleanExplainWithFindOneAndDelete', {
    metadata: {
      requires: {
        mongodb: '>3.2'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorBooleanExplainWithFindOneAndDelete');
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
    })
  });

  it('shouldHonorBooleanExplainWithFindOneAndReplace', {
    metadata: {
      requires: {
        mongodb: '>3.2'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorBooleanExplainWithFindOneAndReplace');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.findOneAndReplace({ a: 1 }, { a: 2 }, { explain: true }, (err, explanation) => {
          expect(err).to.not.exist;
          expect(explanation).to.exist;
          expect(explanation).property('queryPlanner').to.exist;
          done();
        });
      });
    })
  });

  it('shouldHonorBooleanExplainWithFindOneAndUpdate', {
    metadata: {
      requires: {
        mongodb: '>3.2'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorBooleanExplainWithFindOneAndUpdate');
      var collection = db.collection('test');

      collection.insertOne({ a: 1 }, (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        collection.findOneAndUpdate(
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
    })
  });

  it('shouldHonorBooleanExplainWithMapReduce', {
    metadata: {
      requires: {
        mongodb: '>4.4'
      }
    },
    test: withClient(function (client, done) {
      var db = client.db('shouldHonorBooleanExplainWithMapReduce');
      var collection = db.collection('test');

      collection.insertMany([{ user_id: 1 }, { user_id: 2 }], (err, res) => {
        expect(err).to.not.exist;
        expect(res).to.exist;

        var map = 'function() { emit(this.user_id, 1); }';
        var reduce = 'function(k,vals) { return 1; }';

        collection.mapReduce(
          map,
          reduce,
          { out: { replace: 'tempCollection' }, explain: true },
          (err, explanation) => {
            expect(err).to.not.exist;
            expect(explanation).to.exist;
            expect(explanation).property('stages').to.exist;
            done();
          }
        );
      });
    })
  });
});
