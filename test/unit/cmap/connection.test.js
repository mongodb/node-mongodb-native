'use strict';

const BSON = require('bson');
const mock = require('mongodb-mock-server');
const connect = require('../../../lib/cmap/connect');
const Connection = require('../../../lib/cmap/connection').Connection;
const expect = require('chai').expect;

describe('Connection', function() {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('should support fire-and-forget messages', function(done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }

      // blackhole all other requests
    });

    connect(
      Object.assign({ bson: BSON, connectionType: Connection }, server.address()),
      (err, conn) => {
        expect(err).to.not.exist;
        expect(conn).to.exist;

        conn.command('$admin.cmd', { ping: 1 }, { noResponse: true }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.not.exist;

          done();
        });
      }
    );
  });

  it('should destroy streams which time out', function(done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }

      // blackhole all other requests
    });

    connect(
      Object.assign({ bson: BSON, connectionType: Connection }, server.address()),
      (err, conn) => {
        expect(err).to.not.exist;
        expect(conn).to.exist;

        conn.command('$admin.cmd', { ping: 1 }, { socketTimeout: 50 }, (err, result) => {
          expect(err).to.exist;
          expect(result).to.not.exist;

          expect(conn)
            .property('stream')
            .property('destroyed').to.be.true;

          done();
        });
      }
    );
  });
});
