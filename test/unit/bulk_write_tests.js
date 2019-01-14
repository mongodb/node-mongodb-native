'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');

describe('Bulk Writes', function() {
  const test = {};

  let documents;
  before(() => {
    documents = new Array(20000).fill('').map(() => ({
      arr: new Array(19).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    }));
  });

  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;
    });
  });
  afterEach(() => mock.cleanup());

  it('should propagate errors', function(done) {
    const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);

    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    let hasErrored = false;

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      } else if (doc.insert) {
        if (hasErrored) {
          return request.reply({ ok: 1 });
        }
        hasErrored = true;
        return request.reply({ ok: 0 });
      } else {
        close(`Received unknown command ${doc}`);
      }
    });

    client.connect(function(err) {
      expect(err).to.be.null;

      const coll = client.db('foo').collection('bar');

      coll.insert(documents, { ordered: false }, function(err) {
        try {
          expect(err).to.be.an.instanceOf(Error);
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });
});
