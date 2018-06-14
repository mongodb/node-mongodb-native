'use strict';

const MongoClient = require('../..').MongoClient;
const expect = require('chai').expect;
const mock = require('mongodb-mock-server');

describe('bypass document validation', function() {
  const test = {};
  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;
    });
  });
  afterEach(() => mock.cleanup());

  // general test for aggregate function
  function testAggregate(bypassDocumentValidation, done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.aggregate) {
        try {
          expect(doc.bypassDocumentValidation).equal(bypassDocumentValidation || undefined);
          request.reply({
            ok: 1,
            cursor: {
              firstBatch: [{}],
              id: 23,
              ns: 'test.test'
            }
          });
        } catch (e) {
          close(e);
        }
      }

      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    client.connect(function(err, client) {
      expect(err).to.not.exist;
      var db = client.db('test');
      var collection = db.collection('test_c');

      var options = {
        bypassDocumentValidation: bypassDocumentValidation
      };

      var pipeline = [
        {
          $project: {}
        }
      ];
      collection.aggregate(pipeline, options).next(() => close());
    });
  }
  // aggregate
  it('should only set bypass document validation if strictly true in aggregate', function(done) {
    testAggregate(true, done);
  });

  it('should not set bypass document validation if not strictly true in aggregate', function(done) {
    testAggregate(false, done);
  });

  // general test for mapReduce function
  function testMapReduce(bypassDocumentValidation, done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.mapreduce) {
        try {
          expect(doc.bypassDocumentValidation).equal(bypassDocumentValidation || undefined);
          request.reply({
            results: 't',
            ok: 1
          });
        } catch (e) {
          close(e);
        }
      }

      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    client.connect(function(err, client) {
      expect(err).to.not.exist;
      var db = client.db('test');
      var collection = db.collection('test_c');

      var options = {
        out: 'test_c',
        bypassDocumentValidation: bypassDocumentValidation
      };

      collection.mapReduce(function map() {}, function reduce() {}, options, e => {
        close(e);
      });
    });
  }
  // map reduce
  it('should only set bypass document validation if strictly true in mapReduce', function(done) {
    testMapReduce(true, done);
  });

  it('should not set bypass document validation if not strictly true in mapReduce', function(done) {
    testMapReduce(false, done);
  });

  // general test for findAndModify function
  function testFindAndModify(bypassDocumentValidation, done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.findAndModify) {
        try {
          expect(doc.bypassDocumentValidation).equal(bypassDocumentValidation || undefined);
          request.reply({
            ok: 1
          });
        } catch (e) {
          close(e);
        }
      }

      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    client.connect(function(err, client) {
      expect(err).to.not.exist;
      var db = client.db('test');
      var collection = db.collection('test_c');

      var options = {
        bypassDocumentValidation: bypassDocumentValidation
      };

      collection.findAndModify(
        { name: 'Andy' },
        { rating: 1 },
        { $inc: { score: 1 } },
        options,
        e => {
          close(e);
        }
      );
    });
  }
  // find and modify
  it('should only set bypass document validation if strictly true in findAndModify', function(done) {
    testFindAndModify(true, done);
  });

  it('should not set bypass document validation if not strictly true in findAndModify', function(done) {
    testFindAndModify(false, done);
  });

  // general test for BlukWrite to test changes made in ordered.js and unordered.js
  function testBulkWrite(bypassDocumentValidation, ordered, done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.insert) {
        try {
          expect(doc.bypassDocumentValidation).equal(bypassDocumentValidation || undefined);
          request.reply({
            ok: 1
          });
        } catch (e) {
          close(e);
        }
      }

      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    client.connect(function(err, client) {
      expect(err).to.not.exist;
      var db = client.db('test');
      var collection = db.collection('test_c');

      var options = {
        bypassDocumentValidation: bypassDocumentValidation,
        ordered: ordered
      };

      collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close());
    });
  }
  // ordered bulk write, testing change in ordered.js
  it('should only set bypass document validation if strictly true in ordered bulkWrite', function(done) {
    testBulkWrite(true, true, done);
  });

  it('should not set bypass document validation if not strictly true in ordered bulkWrite', function(done) {
    testBulkWrite(false, true, done);
  });

  // unordered bulk write, testing change in ordered.js
  it('should only set bypass document validation if strictly true in unordered bulkWrite', function(done) {
    testBulkWrite(true, false, done);
  });

  it('should not set bypass document validation if not strictly true in unordered bulkWrite', function(done) {
    testBulkWrite(false, false, done);
  });
});
