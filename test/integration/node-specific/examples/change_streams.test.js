/* eslint no-unused-vars: 0 no-restricted-globals: 0 */

'use strict';

const { setTimeout } = require('timers');
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

// TODO: NODE-3819: Unskip flaky MacOS/Windows tests.
const maybeDescribe = process.platform !== 'linux' ? describe.skip : describe;
maybeDescribe('examples(change-stream):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);

    // ensure database exists, we need this for 3.6
    await db.collection('inventory').insertOne({});

    // now clear the collection
    await db.collection('inventory').deleteMany({});
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  class Looper {
    constructor(lambda, interval) {
      this._run = false;
      this._lambda = lambda;
      this._interval = interval || 50;
    }

    async _go() {
      this._run = true;
      while (this._run) {
        await new Promise(r => setTimeout(r, this._interval));
        await this._lambda();
      }
    }

    run() {
      this._p = this._go().catch(() => {});
    }

    stop() {
      this._run = false;
      return this._p;
    }
  }

  it('Open A Change Stream', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function () {
      const looper = new Looper(async () => {
        await db.collection('inventory').insertOne({ a: 1 });
      });
      looper.run();

      // Start Changestream Example 1
      const collection = db.collection('inventory');
      const changeStream = collection.watch();
      changeStream
        .on('change', next => {
          // process next document
        })
        .once('error', () => {
          // handle error
        });
      // End Changestream Example 1

      const changeStreamIterator = collection.watch();
      const next = await changeStreamIterator.next();

      await changeStream.close();
      await changeStreamIterator.close();
      await looper.stop();

      expect(next).to.have.property('operationType').that.equals('insert');
    }
  });

  it('Open A Change Stream and use iteration methods', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function () {
      const looper = new Looper(() => db.collection('inventory').insertOne({ a: 1 }));
      looper.run();

      // Start Changestream Example 1 Alternative
      const collection = db.collection('inventory');
      const changeStream = collection.watch();
      const next = await changeStream.next();
      // End Changestream Example 1 Alternative

      await changeStream.close();
      await looper.stop();

      expect(next).to.have.property('operationType').that.equals('insert');
    }
  });

  it('Lookup Full Document for Update Operations', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function () {
      await db.collection('inventory').insertOne({ a: 1, b: 2 });
      const looper = new Looper(() =>
        db.collection('inventory').updateOne({ a: 1 }, { $set: { a: 2 } })
      );
      looper.run();

      // Start Changestream Example 2
      const collection = db.collection('inventory');
      const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
      changeStream
        .on('change', next => {
          // process next document
        })
        .once('error', error => {
          // handle error
        });
      // End Changestream Example 2

      // Start Changestream Example 2 Alternative
      const changeStreamIterator = collection.watch([], { fullDocument: 'updateLookup' });
      const next = await changeStreamIterator.next();
      // End Changestream Example 2 Alternative

      await changeStream.close();
      await changeStreamIterator.close();
      await looper.stop();

      expect(next).to.have.property('operationType').that.equals('update');
      expect(next).to.have.property('fullDocument').that.has.all.keys(['_id', 'a', 'b']);
    }
  });

  it('Resume a Change Stream', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function () {
      const looper = new Looper(async () => {
        await db.collection('inventory').insertOne({ a: 1 });
        await db.collection('inventory').insertOne({ b: 2 });
      });
      looper.run();

      let processChange;
      const streamExampleFinished = new Promise(resolve => {
        processChange = resolve;
      });

      // Start Changestream Example 3
      const collection = db.collection('inventory');
      const changeStream = collection.watch();

      let newChangeStream;
      changeStream
        .once('change', next => {
          const resumeToken = changeStream.resumeToken;
          changeStream.close();

          newChangeStream = collection.watch([], { resumeAfter: resumeToken });
          newChangeStream
            .on('change', next => {
              processChange(next);
            })
            .once('error', error => {
              // handle error
            });
        })
        .once('error', error => {
          // handle error
        });
      // End Changestream Example 3

      // Start Changestream Example 3 Alternative
      const changeStreamIterator = collection.watch();
      const change1 = await changeStreamIterator.next();

      const resumeToken = changeStreamIterator.resumeToken;
      changeStreamIterator.close();

      const newChangeStreamIterator = collection.watch([], { resumeAfter: resumeToken });
      const change2 = await newChangeStreamIterator.next();
      // End Changestream Example 3 Alternative

      await newChangeStreamIterator.close();

      await streamExampleFinished;
      await newChangeStream.close();
      await looper.stop();

      expect(change1).to.have.nested.property('fullDocument.a', 1);
      expect(change2).to.have.nested.property('fullDocument.b', 2);
    }
  });

  it('Modify Change Stream Output', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function () {
      const looper = new Looper(async () => {
        await db.collection('inventory').insertOne({ username: 'alice' });
      });
      looper.run();

      // Start Changestream Example 4
      const pipeline = [
        { $match: { 'fullDocument.username': 'alice' } },
        { $addFields: { newField: 'this is an added field!' } }
      ];

      const collection = db.collection('inventory');
      const changeStream = collection.watch(pipeline);
      changeStream
        .on('change', next => {
          // process next document
        })
        .once('error', error => {
          // handle error
        });
      // End Changestream Example 4

      // Start Changestream Example 4 Alternative
      const changeStreamIterator = collection.watch(pipeline);
      const next = await changeStreamIterator.next();
      // End Changestream Example 4 Alternative

      await changeStream.close();
      await changeStreamIterator.close();
      await looper.stop();

      expect(next).to.have.nested.property('fullDocument.username', 'alice');
      expect(next).to.have.property('newField', 'this is an added field!');
    }
  });
});
