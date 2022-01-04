import { expect } from 'chai';

import { MongoClient } from '../../../src';
import { isHello } from '../../../src/utils';
import { cleanup, createServer, HELLO } from '../../tools/mongodb-mock';

describe('FineOneAndUpdateOperation', () => {
  describe('bypass document validation', function () {
    let server = null;
    beforeEach(() =>
      createServer().then(_server => {
        server = _server;
      })
    );
    afterEach(() => cleanup());

    // general test for findOneAndUpdate function
    function testFindOneAndUpdate(config, done) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);
      let close = e => {
        close = () => null;
        client.close(() => done(e));
      };

      server.setMessageHandler(request => {
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

        if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        const db = client.db('test');
        const collection = db.collection('test_c');

        const options = { bypassDocumentValidation: config.actual };

        collection.findOneAndUpdate({ name: 'Andy' }, { $inc: { score: 1 } }, options, e => {
          close(e);
        });
      });
    }
    // find one and update
    it('should only set bypass document validation if strictly true in findOneAndUpdate', function (done) {
      testFindOneAndUpdate({ expected: true, actual: true }, done);
    });

    it('should not set bypass document validation if not strictly true in findOneAndUpdate', function (done) {
      testFindOneAndUpdate({ expected: undefined, actual: false }, done);
    });
  });
});
