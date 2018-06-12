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

  // aggregate
  it('should only set bypass document validation if strictly true in aggregate', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.aggregate) {
        try {
          expect(doc.bypassDocumentValidation).equal(true);
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
        bypassDocumentValidation: true
      };

      var pipeline = [
        {
          $project: {}
        }
      ];
      collection.aggregate(pipeline, options).next(() => close());
    });
  });

  it('should not set bypass document validation if not strictly true in aggregate', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.aggregate) {
        try {
          expect(doc.bypassDocumentValidation).equal(undefined);
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
        bypassDocumentValidation: false
      };

      var pipeline = [
        {
          $project: {}
        }
      ];

      collection.aggregate(pipeline, options).next(() => close());
    });
  });

  // map reduce
  it('should only set bypass document validation if strictly true in mapReduce', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.mapreduce) {
        try {
          expect(doc.bypassDocumentValidation).equal(true);
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
        bypassDocumentValidation: true
      };

      collection.mapReduce(function map() {}, function reduce() {}, options, e => {
        close(e);
      });
    });
  });

  it('should not set bypass document validation if not strictly true in mapReduce', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.mapreduce) {
        try {
          expect(doc.bypassDocumentValidation).equal(undefined);
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
      var db = client.db('test_2');
      var collection = db.collection('test_c2');

      var options = {
        out: 'test_c2',
        bypassDocumentValidation: false
      };

      collection.mapReduce(function map() {}, function reduce() {}, options, e => {
        close(e);
      });
    });
  });

  // find and modify
  it('should only set bypass document validation if strictly true in findAndModify', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.findAndModify) {
        try {
          expect(doc.bypassDocumentValidation).equal(true);
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
        bypassDocumentValidation: true
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
  });

  it('should not set bypass document validation if not strictly true in findAndModify', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.findAndModify) {
        try {
          expect(doc.bypassDocumentValidation).equal(undefined);
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
        bypassDocumentValidation: false
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
  });

  // ordered bulk write, testing change in ordered.js
  it('should only set bypass document validation if strictly true in ordered bulkWrite', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.insert) {
        try {
          expect(doc.bypassDocumentValidation).equal(true);
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
        bypassDocumentValidation: true,
        ordered: true
      };

      collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close());
    });
  });

  it('should not set bypass document validation if not strictly true in ordered bulkWrite', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;

      if (doc.insert) {
        try {
          expect(doc.bypassDocumentValidation).equal(undefined);
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
        bypassDocumentValidation: false,
        ordered: true
      };

      collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close());
    });
  });

  // unordered bulk write, testing change in ordered.js
  it('should only set bypass document validation if strictly true in unordered bulkWrite', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.insert) {
        try {
          expect(doc.bypassDocumentValidation).equal(true);
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
        bypassDocumentValidation: true,
        ordered: false
      };

      collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close());
    });
  });

  it('should not set bypass document validation if not strictly true in unordered bulkWrite', function(done) {
    const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    test.server.setMessageHandler(request => {
      var doc = request.document;
      if (doc.insert) {
        try {
          expect(doc.bypassDocumentValidation).equal(undefined);
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
        bypassDocumentValidation: false,
        ordered: false
      };

      collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close());
    });
  });
});
