'use strict';

const Pool = require('../../../lib/connection/pool');
const BSON = require('bson');
const apm = require('../../../lib/connection/apm');
const expect = require('chai').expect;

const commands = require('../../../lib/connection/commands');
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
              star: 'trek'
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
          filter: query.query.$query
        });
    });
  });
});
