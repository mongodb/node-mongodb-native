'use strict';

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
  function testAggregate(testConfiguration, config, done) {
    const client = testConfiguration.newClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.aggregate) {
        try {
          expect(doc.bypassDocumentValidation).equal(config.expected);
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
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = { bypassDocumentValidation: config.actual };

      const pipeline = [
        {
          $project: {}
        }
      ];
      collection.aggregate(pipeline, options).next(() => close());
    });
  }
  // aggregate
  it('should only set bypass document validation if strictly true in aggregate', function(done) {
    testAggregate(this.configuration, { expected: true, actual: true }, done);
  });

  it('should not set bypass document validation if not strictly true in aggregate', function(done) {
    testAggregate(this.configuration, { expected: undefined, actual: false }, done);
  });

  // general test for mapReduce function
  function testMapReduce(testConfiguration, config, done) {
    const client = testConfiguration.newClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.mapreduce) {
        try {
          expect(doc.bypassDocumentValidation).equal(config.expected);
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
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = {
        out: 'test_c',
        bypassDocumentValidation: config.actual
      };

      collection.mapReduce(function map() {}, function reduce() {}, options, e => {
        close(e);
      });
    });
  }
  // map reduce
  it('should only set bypass document validation if strictly true in mapReduce', function(done) {
    testMapReduce(this.configuration, { expected: true, actual: true }, done);
  });

  it('should not set bypass document validation if not strictly true in mapReduce', function(done) {
    testMapReduce(this.configuration, { expected: undefined, actual: false }, done);
  });

  // general test for findAndModify function
  function testFindAndModify(testConfiguration, config, done) {
    const client = testConfiguration.newClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.findAndModify) {
        try {
          expect(doc.bypassDocumentValidation).equal(config.expected);
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
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = { bypassDocumentValidation: config.actual };

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
    testFindAndModify(this.configuration, { expected: true, actual: true }, done);
  });

  it('should not set bypass document validation if not strictly true in findAndModify', function(done) {
    testFindAndModify(this.configuration, { expected: undefined, actual: false }, done);
  });

  // general test for BlukWrite to test changes made in ordered.js and unordered.js
  function testBulkWrite(testConfiguration, config, done) {
    const client = testConfiguration.newClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.insert) {
        try {
          expect(doc.bypassDocumentValidation).equal(config.expected);
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
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = {
        bypassDocumentValidation: config.actual,
        ordered: config.ordered
      };

      collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close());
    });
  }
  // ordered bulk write, testing change in ordered.js
  it('should only set bypass document validation if strictly true in ordered bulkWrite', function(done) {
    testBulkWrite(this.configuration, { expected: true, actual: true, ordered: true }, done);
  });

  it('should not set bypass document validation if not strictly true in ordered bulkWrite', function(done) {
    testBulkWrite(this.configuration, { expected: undefined, actual: false, ordered: true }, done);
  });

  // unordered bulk write, testing change in ordered.js
  it('should only set bypass document validation if strictly true in unordered bulkWrite', function(done) {
    testBulkWrite(this.configuration, { expected: true, actual: true, ordered: false }, done);
  });

  it('should not set bypass document validation if not strictly true in unordered bulkWrite', function(done) {
    testBulkWrite(this.configuration, { expected: undefined, actual: false, ordered: false }, done);
  });
});
