'use strict';
const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const { ObjectId, Code, MongoClient } = require('../../../src');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { isHello } = require('../../../src/utils');

const TEST_OPTIONS = { writeConcern: { w: 2, wtimeoutMS: 1000 } };

class WriteConcernTest {
  constructor() {
    this.responseDecoration = {};
    const electionIds = [new ObjectId(), new ObjectId()];
    const defaultFields = Object.assign({}, mock.HELLO, {
      setName: 'rs',
      setVersion: 1,
      electionId: electionIds[0],
      hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
      primary: 'localhost:32000',
      arbiters: ['localhost:32002']
    });
    this.serverStates = {
      primary: [
        Object.assign({}, defaultFields, {
          [LEGACY_HELLO_COMMAND]: true,
          secondary: false,
          me: 'localhost:32000'
        })
      ],
      firstSecondary: [
        Object.assign({}, defaultFields, {
          [LEGACY_HELLO_COMMAND]: false,
          secondary: true,
          me: 'localhost:32001'
        })
      ],
      arbiter: [
        Object.assign({}, defaultFields, {
          [LEGACY_HELLO_COMMAND]: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002'
        })
      ]
    };
  }

  decorateResponse(obj) {
    Object.assign(this.responseDecoration, obj);
  }

  async run(resultKey, testFn) {
    const self = this;
    let primaryServer = await mock.createServer(32000, 'localhost');
    let firstSecondaryServer = await mock.createServer(32001, 'localhost');
    let arbiterServer = await mock.createServer(32002, 'localhost');

    primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(self.serverStates.primary[0]);
      } else if (doc[resultKey]) {
        self.commandResult = doc;
        request.reply(Object.assign({ ok: 1 }, self.responseDecoration));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    firstSecondaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(self.serverStates.firstSecondary[0]);
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    arbiterServer.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(self.serverStates.arbiter[0]);
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    const client = new MongoClient(
      'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
    );

    await client.connect();
    await testFn(client, client.db('write_concern_db'));
  }
}

function writeConcernTest(command, testFn) {
  return async function () {
    const t = new WriteConcernTest();
    switch (command) {
      case 'aggregate':
        t.decorateResponse({ cursor: { id: 0, firstBatch: [], ns: 'write_concern_db' } });
        break;
      case 'mapReduce':
        t.decorateResponse({ result: 'tempCollection' });
        break;
    }
    await t.run(command, async (client, db) => {
      await testFn(db, Object.assign({}, TEST_OPTIONS));
      expect({
        w: TEST_OPTIONS.writeConcern.w,
        wtimeout: TEST_OPTIONS.writeConcern.wtimeoutMS
      }).to.deep.equal(t.commandResult.writeConcern);
      await client.close();
    });
  };
}

describe('Command Write Concern', function () {
  afterEach(() => mock.cleanup());

  it('successfully pass through writeConcern to aggregate command', () =>
    writeConcernTest('aggregate', (db, writeConcernTestOptions) =>
      db
        .collection('test')
        .aggregate(
          [{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }],
          writeConcernTestOptions
        )
        .toArray()
    ));

  it('successfully pass through writeConcern to create command', () =>
    writeConcernTest('create', (db, writeConcernTestOptions) =>
      db.createCollection('test_collection_methods', writeConcernTestOptions)
    ));

  it('successfully pass through writeConcern to createIndexes command', () =>
    writeConcernTest('createIndexes', (db, writeConcernTestOptions) =>
      db
        .collection('indexOptionDefault')
        .createIndex(
          { a: 1 },
          Object.assign({ indexOptionDefaults: true }, writeConcernTestOptions)
        )
    ));

  it('successfully pass through writeConcern to drop command', () =>
    writeConcernTest('drop', (db, writeConcernTestOptions) =>
      db.collection('indexOptionDefault').drop(writeConcernTestOptions)
    ));

  it('successfully pass through writeConcern to dropDatabase command', () =>
    writeConcernTest('dropDatabase', (db, writeConcernTestOptions) =>
      db.dropDatabase(writeConcernTestOptions)
    ));

  it('successfully pass through writeConcern to dropIndexes command', () =>
    writeConcernTest('dropIndexes', (db, writeConcernTestOptions) =>
      db.collection('test').dropIndexes(writeConcernTestOptions)
    ));

  it('successfully pass through writeConcern to mapReduce command', () =>
    writeConcernTest('mapReduce', function (db, writeConcernTestOptions) {
      const map = new Code('function() { emit(this.user_id, 1); }');
      const reduce = new Code('function(k,vals) { return 1; }');
      return db
        .collection('test')
        .mapReduce(
          map,
          reduce,
          Object.assign({ out: { replace: 'tempCollection' } }, writeConcernTestOptions)
        );
    }));

  it('successfully pass through writeConcern to createUser command', () =>
    writeConcernTest('createUser', (db, writeConcernTestOptions) =>
      db.admin().addUser('kay:kay', 'abc123', writeConcernTestOptions)
    ));

  it('successfully pass through writeConcern to dropUser command', () =>
    writeConcernTest('dropUser', (db, writeConcernTestOptions) =>
      db.admin().removeUser('kay:kay', writeConcernTestOptions)
    ));
});
