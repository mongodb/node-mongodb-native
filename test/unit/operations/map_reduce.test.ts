import { expect } from 'chai';

import { MongoClient } from '../../../src';
import { isHello } from '../../../src/utils';
import { cleanup, createServer, HELLO } from '../../tools/mongodb-mock';

describe('MapReduceOperation', () => {
  context('bypass document validation', function () {
    const test = {
      server: null
    };
    beforeEach(() =>
      createServer().then(server => {
        test.server = server;
      })
    );
    afterEach(() => cleanup());

    function testMapReduce(config, done) {
      const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
      let close = e => {
        close = () => null;
        client.close(() => done(e));
      };

      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.mapReduce) {
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

        const options = {
          out: 'test_c',
          bypassDocumentValidation: config.actual
        };

        collection.mapReduce(
          function map() {
            return null;
          },
          function reduce() {
            return null;
          },
          options as any,
          e => {
            close(e);
          }
        );
      });
    }
    // map reduce
    it('should only set bypass document validation if strictly true in mapReduce', function (done) {
      testMapReduce({ expected: true, actual: true }, done);
    });

    it('should not set bypass document validation if not strictly true in mapReduce', function (done) {
      testMapReduce({ expected: undefined, actual: false }, done);
    });
  });
});
