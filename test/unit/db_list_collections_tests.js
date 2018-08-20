'use strict';

const mock = require('mongodb-mock-server');
const expect = require('chai').expect;

describe('db.listCollections', function() {
  const testHarness = {};
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(server => {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          return request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
        }

        if (doc.listCollections) {
          return request.reply({
            ok: 1,
            cursor: {
              id: 0,
              ns: 'test.$cmd.listCollections',
              firstBatch: [{ name: 'test', type: 'collection' }]
            }
          });
        }
      });
      testHarness.server = server;
    });
  });

  [
    {
      description: 'should always send nameOnly option, defaulting to false',
      command: db => db.listCollections().toArray(() => {}),
      listCollectionsValue: false
    },
    {
      description: 'should propagate the nameOnly option',
      command: db => db.listCollections({}, { nameOnly: true }).toArray(() => {}),
      listCollectionsValue: true
    },
    {
      description: 'should send nameOnly: true for db.createCollection',
      command: db => db.createCollection('foo', () => {}),
      listCollectionsValue: true
    },
    {
      description: 'should send nameOnly: true for db.collections',
      command: db => db.collections(() => {}),
      listCollectionsValue: true
    },
    {
      description: 'should send nameOnly: true for db.collection',
      command: db => db.collection('foo', { strict: true }, () => {}),
      listCollectionsValue: true
    }
  ].forEach(config => {
    function testFn(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testHarness.server.uri()}/test`, {
        monitorCommands: true
      });

      client.on('commandStarted', e => {
        if (e.commandName === 'listCollections') {
          try {
            expect(e).to.have.nested.property('command.nameOnly', config.listCollectionsValue);
            client.close(done);
          } catch (err) {
            client.close(() => done(err));
          }
        }
      });

      client.connect((err, client) => {
        const db = client.db('foo');
        config.command(db);
      });
    }

    it(config.description, { test: testFn, metadata: { requires: { mongodb: '>=2.7.6' } } });
  });
});
