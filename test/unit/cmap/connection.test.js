'use strict';

const BSON = require('bson');
const mock = require('mongodb-mock-server');
const connect = require('../../../lib/core/connection/connect');
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
      Object.assign({ bson: new BSON(), connectionType: Connection }, server.address()),
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
      Object.assign({ bson: new BSON(), connectionType: Connection }, server.address()),
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

  it('should throw a network error with kBeforeHandshake set to false on timeout after hand shake', function(done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }
      // respond to no other requests to trigger timeout event
    });

    const address = server.address();
    const options = {
      bson: new BSON(),
      connectionType: Connection,
      host: address.host,
      port: address.port
    };

    connect(options, (err, conn) => {
      expect(err).to.be.a('undefined');
      expect(conn).to.be.instanceOf(Connection);
      expect(conn)
        .to.have.property('ismaster')
        .that.is.a('object');

      conn.command('$admin.cmd', { ping: 1 }, { socketTimeout: 50 }, err => {
        const beforeHandshakeSymbol = Object.getOwnPropertySymbols(err)[0];
        expect(beforeHandshakeSymbol).to.be.a('symbol');
        expect(err).to.have.property(beforeHandshakeSymbol, false);

        done();
      });
    });
  });

  it('should throw a network error with kBeforeHandshake set to true on timeout before hand shake', function(done) {
    // respond to no requests to trigger timeout event
    server.setMessageHandler(() => {});

    const address = server.address();
    const options = {
      bson: new BSON(),
      connectionType: Connection,
      host: address.host,
      port: address.port,
      socketTimeout: 50
    };

    connect(options, (err, conn) => {
      expect(conn).to.be.a('undefined');

      const beforeHandshakeSymbol = Object.getOwnPropertySymbols(err)[0];
      expect(beforeHandshakeSymbol).to.be.a('symbol');
      expect(err).to.have.property(beforeHandshakeSymbol, true);

      done();
    });
  });
});
