'use strict';

const co = require('co');
const mock = require('mongodb-mock-server');
const sinon = require('sinon');
const ObjectId = require('bson').ObjectId;
const expect = require('chai').expect;
const ReadPreference = require('../../../lib/core/topologies/read_preference');

const TEST_OPTIONS = {};

class SetReadPreferenceTest {
  constructor(configuration) {
    this.configuration = configuration;
    this.responseDecoration = {};
    const electionIDs = [new ObjectId(), new ObjectId()];
    const defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
      setName: 'rs',
      setVersion: 1,
      electionId: electionIDs[0],
      hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
      primary: 'localhost:32000',
      arbiters: ['localhost:32002']
    });

    this.serverStates = {
      primary: [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000'
        })
      ],
      firstSecondary: [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001'
        })
      ],
      arbiter: [
        Object.assign({}, defaultFields, {
          ismaster: false,
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

  run(resultKey, testFn) {
    const self = this;
    co(function*() {
      let primaryServer = yield mock.createServer(32000, 'localhost');
      let firstSecondaryServer = yield mock.createServer(32001, 'localhost');
      let arbiterServer = yield mock.createServer(32002, 'localhost');

      primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
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
        if (doc.ismaster || doc.hello) {
          request.reply(self.serverStates.firstSecondary[0]);
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });
      arbiterServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          request.reply(self.serverStates.arbiter[0]);
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      const client = self.configuration.newClient(
        'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
      );

      client.connect(function(err, client) {
        expect(err).to.not.exist;
        testFn(client, client.db(self.configuration.db));
      });
    });
  }
}

describe('Cursor setReadPreference', function() {
  afterEach(done => {
    mock.cleanup();
    done();
  });

  function setReadPreferenceTest(command, testFn, configuration) {
    return done => {
      const t = new SetReadPreferenceTest(configuration);
      switch (command) {
        case 'find':
          t.decorateResponse({
            cursor: { id: 0, firstBatch: [], ns: configuration.options.db }
          });
          break;
        default:
          break;
      }
      t.run(command, (client, db) => {
        testFn.call(this, db, Object.assign({}, TEST_OPTIONS), err => {
          expect(err).to.not.exist;
          //expect({}).to.deep.equal(t.commandResult.readPreference);
          done();
        });
      });
    };
  }

  const metadata = { requires: { generators: true, topology: 'single' } };

  it('successfully applies readPreference to command', {
    metadata: metadata,
    test: function(done) {
      setReadPreferenceTest(
        'find',
        (db, options, done) => {
          let cursor = db.collection('test').find({});
          cursor.setReadPreference(ReadPreference.SECONDARY);
          done();
        },
        this.configuration
      )(done);
    }
  });
});
