'use strict';

const Pool = require('../../../lib/core/connection/pool');
const BSON = require('bson');
const apm = require('../../../lib/core/connection/apm');
const expect = require('chai').expect;

const commands = require('../../../lib/core/connection/commands');
const Query = commands.Query;
const KillCursor = commands.KillCursor;
const GetMore = commands.GetMore;

const bson = new BSON();
const pool = new Pool({}, { bson });

describe('APM tests', function() {
  describe('CommandStartedEvent', function() {
    // Only run on single topology since these are unit tests
    const metadata = { requires: { topology: ['single'] } };

    it('should wrap a basic query option', metadata, function() {
      const db = 'test1';
      const coll = 'testingQuery';
      const query = new Query(
        bson,
        `${db}.${coll}`,
        {
          testCmd: 1,
          fizz: 'buzz',
          star: 'trek'
        },
        {}
      );

      const startEvent = new apm.CommandStartedEvent(pool, query);

      expect(startEvent).to.have.property('commandName', 'testCmd');
      expect(startEvent).to.have.property('databaseName', db);
      expect(startEvent).to.have.property('requestId', query.requestId);
      expect(startEvent)
        .to.have.property('connectionId')
        .that.is.a('string');
      expect(startEvent)
        .to.have.property('command')
        .that.deep.equals(query.query);
    });

    it('should wrap a basic killCursor command', metadata, function() {
      const db = 'test2';
      const coll = 'testingKillCursors';
      const killCursor = new KillCursor(bson, `${db}.${coll}`, [12, 42, 57]);

      const startEvent = new apm.CommandStartedEvent(pool, killCursor);

      expect(startEvent).to.have.property('commandName', 'killCursors');
      expect(startEvent).to.have.property('databaseName', db);
      expect(startEvent).to.have.property('requestId', killCursor.requestId);
      expect(startEvent)
        .to.have.property('connectionId')
        .that.is.a('string');
      expect(startEvent)
        .to.have.property('command')
        .that.deep.equals({
          killCursors: coll,
          cursors: killCursor.cursorIds
        });
    });

    it('should wrap a basic GetMore command', metadata, function() {
      const db = 'test3';
      const coll = 'testingGetMore';
      const numberToReturn = 321;
      const getMore = new GetMore(bson, `${db}.${coll}`, 5525, { numberToReturn });

      const startEvent = new apm.CommandStartedEvent(pool, getMore);

      expect(startEvent).to.have.property('commandName', 'getMore');
      expect(startEvent).to.have.property('databaseName', db);
      expect(startEvent).to.have.property('requestId', getMore.requestId);
      expect(startEvent)
        .to.have.property('connectionId')
        .that.is.a('string');
      expect(startEvent)
        .to.have.property('command')
        .that.deep.equals({
          getMore: getMore.cursorId,
          collection: coll,
          batchSize: numberToReturn
        });
    });

    it(
      'should upconvert a Query wrapping a command into the corresponding command',
      metadata,
      function() {
        const db = 'admin';
        const coll = '$cmd';
        const query = new Query(
          bson,
          `${db}.${coll}`,
          {
            $query: {
              testCmd: 1,
              fizz: 'buzz',
              star: 'trek',
              batchSize: 0,
              skip: 0
            }
          },
          {}
        );

        const startEvent = new apm.CommandStartedEvent(pool, query);

        expect(startEvent).to.have.property('commandName', 'testCmd');
        expect(startEvent).to.have.property('databaseName', db);
        expect(startEvent).to.have.property('requestId', query.requestId);
        expect(startEvent)
          .to.have.property('connectionId')
          .that.is.a('string');
        expect(startEvent)
          .to.have.property('command')
          .that.deep.equals(query.query.$query);
      }
    );

    it('should upconvert a Query wrapping a query into a find command', metadata, function() {
      const db = 'test5';
      const coll = 'testingFindCommand';
      const query = new Query(
        bson,
        `${db}.${coll}`,
        {
          $query: {
            testCmd: 1,
            fizz: 'buzz',
            star: 'trek'
          }
        },
        {}
      );

      const startEvent = new apm.CommandStartedEvent(pool, query);

      expect(startEvent).to.have.property('commandName', 'find');
      expect(startEvent).to.have.property('databaseName', db);
      expect(startEvent).to.have.property('requestId', query.requestId);
      expect(startEvent)
        .to.have.property('connectionId')
        .that.is.a('string');
      expect(startEvent)
        .to.have.property('command')
        .that.deep.equals({
          find: coll,
          filter: query.query.$query,
          batchSize: 0,
          skip: 0
        });
    });
  });

  describe('CommandSucceededEvent', function() {
    // Only run on single topology since these are unit tests
    const metadata = { requires: { topology: ['single'] } };

    it('should support not passing command metadata array', metadata, function() {
      const db = 'test1';
      const coll = 'testingQuery';
      const query = new Query(
        bson,
        `${db}.${coll}`,
        {
          testCmd: 1,
          fizz: 'buzz',
          star: 'trek'
        },
        {}
      );

      const started = process.hrtime();

      const commandSucceededEvent = new apm.CommandSucceededEvent(pool, query, null, started);

      expect(commandSucceededEvent).to.have.property('commandName', 'testCmd');
      expect(commandSucceededEvent).to.have.property('reply', null);
      expect(commandSucceededEvent)
        .to.have.property('requestId')
        .that.is.a('number');
      expect(commandSucceededEvent)
        .to.have.property('connectionId')
        .that.is.a('string');
      expect(commandSucceededEvent)
        .to.have.property('duration')
        .that.is.a('number');
      expect(commandSucceededEvent)
        .to.have.property('metadata')
        .to.deep.equals({});
    });

    it('should support passing on command metadata array', metadata, function() {
      const db = 'test1';
      const coll = 'testingQuery';
      const query = new Query(
        bson,
        `${db}.${coll}`,
        {
          testCmd: 1,
          fizz: 'buzz',
          star: 'trek'
        },
        {}
      );

      const started = process.hrtime();

      const bsonSerializationData = new apm.BSONSerializationData([], process.hrtime());
      const commandSucceededEvent = new apm.CommandSucceededEvent(pool, query, null, started, [
        bsonSerializationData
      ]);

      expect(commandSucceededEvent).to.have.property('commandName', 'testCmd');
      expect(commandSucceededEvent).to.have.property('reply', null);
      expect(commandSucceededEvent)
        .to.have.property('requestId')
        .that.is.a('number');
      expect(commandSucceededEvent)
        .to.have.property('connectionId')
        .that.is.a('string');
      expect(commandSucceededEvent)
        .to.have.property('duration')
        .that.is.a('number');
      expect(commandSucceededEvent)
        .to.have.property('metadata')
        .that.is.a('object');

      const metadata = commandSucceededEvent.metadata;
      expect(metadata)
        .to.have.property('bsonSerialization')
        .that.is.a('object');
      const bsonSerialization = metadata.bsonSerialization;
      expect(bsonSerialization).to.have.property('buffersLength', 0);
      expect(bsonSerialization).to.have.property('type', 'bsonSerialization');
      expect(bsonSerialization)
        .to.have.property('duration')
        .that.is.a('number');
    });
  });

  describe('BSONSerializationData', function() {
    // Only run on single topology since these are unit tests
    const metadata = { requires: { topology: ['single'] } };
    it('should sum length of all buffers', metadata, function() {
      const stepData = new apm.BSONSerializationData(
        [{ length: 1 }, { length: 3 }, { length: 10 }],
        process.hrtime()
      );

      expect(stepData).to.have.property('buffersLength', 14);
    });

    it('should have type "bsonSerialization"', metadata, function() {
      const stepData = new apm.BSONSerializationData(
        [{ length: 1 }, { length: 3 }, { length: 10 }],
        process.hrtime()
      );

      expect(stepData).to.have.property('type', 'bsonSerialization');
    });

    it('should calculate duration from start time and current time', metadata, function() {
      // not mocking process.hrtime, too much work, low reward
      const stepData = new apm.BSONSerializationData(
        [{ length: 1 }, { length: 3 }, { length: 10 }],
        process.hrtime()
      );

      expect(stepData)
        .to.have.property('duration')
        .to.be.below(1);
    });
  });
});
