'use strict';
const { expect } = require('chai');
const mock = require('../tools/mongodb-mock/index');
const { Long } = require('../../src');
const { isHello } = require('../../src/utils');

describe('Views', function () {
  it('should successfully pass through collation to findAndModify command', {
    metadata: { requires: { topology: 'single' } },

    async test() {
      const configuration = this.configuration;

      // Default message fields
      const defaultFields = Object.assign({}, mock.HELLO);

      // Primary server states
      const primary = [Object.assign({}, defaultFields)];

      let commandResult = null;

      // Boot the mock
      const singleServer = await mock.createServer();
      singleServer.setMessageHandler(request => {
        var doc = request.document;
        if (isHello(doc)) {
          request.reply(primary[0]);
        } else if (doc.listCollections) {
          request.reply({
            ok: 1,
            cursor: {
              id: Long.fromNumber(0),
              ns: 'test.cmd$.listCollections',
              firstBatch: []
            }
          });
        } else if (doc.create) {
          commandResult = doc;
          request.reply({ ok: 1 });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      // Connect to the mocks
      const client = configuration.newClient(`mongodb://${singleServer.uri()}/test`);
      await client.connect();
      const db = client.db(this.configuration.db);

      // Simple findAndModify command returning the new document
      const r = await db.createCollection('test', { viewOn: 'users', pipeline: [{ $match: {} }] });
      expect(r).to.exist;
      expect(commandResult).to.containSubset({
        create: 'test',
        viewOn: 'users',
        pipeline: [{ $match: {} }]
      });

      await client.close();
    }
  });
});
