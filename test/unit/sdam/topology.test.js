'use strict';

const mock = require('mongodb-mock-server');
const { expect } = require('chai');
const sinon = require('sinon');
const { Topology } = require('../../../src/sdam/topology');
const { Server } = require('../../../src/sdam/server');
const { ServerDescription } = require('../../../src/sdam/server_description');
const { ns } = require('../../../src/utils');

describe('Topology (unit)', function () {
  describe('client metadata', function () {
    let mockServer;
    before(() => mock.createServer().then(server => (mockServer = server)));
    after(() => mock.cleanup());

    it('should correctly pass appname', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        // Attempt to connect
        var server = new Topology(
          [{ host: this.configuration.host, port: this.configuration.port }],
          {
            appname: 'My application name'
          }
        );

        expect(server.clientMetadata.application.name).to.equal('My application name');
        done();
      }
    });

    it('should report the correct platform in client metadata', function (done) {
      const ismasters = [];
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          ismasters.push(doc);
          request.reply(mock.DEFAULT_ISMASTER);
        } else {
          request.reply({ ok: 1 });
        }
      });

      const client = this.configuration.newClient(`mongodb://${mockServer.uri()}/`);
      client.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        client.db().command({ ping: 1 }, err => {
          expect(err).to.not.exist;

          expect(ismasters).to.have.length.greaterThan(1);
          ismasters.forEach(ismaster =>
            expect(ismaster)
              .nested.property('client.platform')
              .to.match(/unified/)
          );

          done();
        });
      });
    });
  });

  describe('shouldCheckForSessionSupport', function () {
    beforeEach(function () {
      this.sinon = sinon.sandbox.create();

      // these are mocks we want across all tests
      this.sinon.stub(Server.prototype, 'requestCheck');
      this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function (selector, options, callback) {
          setTimeout(() => {
            const server = Array.from(this.s.servers.values())[0];
            callback(null, server);
          }, 50);
        });
    });

    afterEach(function () {
      this.sinon.restore();
    });

    it('should check for sessions if connected to a single server and has no known servers', function (done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.true;
        topology.close(done);
      });
    });

    it('should not check for sessions if connected to a single server', function (done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');

        setTimeout(() => {
          this.emit(
            'descriptionReceived',
            new ServerDescription('someserver:27019', { ok: 1, maxWireVersion: 5 })
          );
        }, 20);
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });

    it('should check for sessions if there are no data-bearing nodes', function (done) {
      const topology = new Topology('mongos:27019,mongos:27018,mongos:27017');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');

        setTimeout(() => {
          this.emit(
            'descriptionReceived',
            new ServerDescription(this.name, { ok: 1, msg: 'isdbgrid', maxWireVersion: 5 })
          );
        }, 20);
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });
  });

  describe('black holes', function () {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

    it('should time out operations against servers that have been blackholed', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;

        let initialIsMasterSent = false;
        if (doc.ismaster && !initialIsMasterSent) {
          request.reply(mock.DEFAULT_ISMASTER_36);
          initialIsMasterSent = true;
        } else {
          // black hole all other operations
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          server.command(ns('admin.$cmd'), { ping: 1 }, { socketTimeout: 250 }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.match(/timed out/);

            topology.close(done);
          });
        });
      });
    });
  });

  describe('error handling', function () {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

    it('should set server to unknown and reset pool on `node is recovering` error', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.reply({ ok: 0, message: 'node is recovering', code: 11600 });
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command(ns('test.test'), { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.true;
            done();
          });
        });
      });
    });

    it('should set server to unknown and NOT reset pool on stepdown errors', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.reply({ ok: 0, message: 'not master' });
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          let poolCleared = false;
          topology.on('connectionPoolCleared', () => (poolCleared = true));

          server.command(ns('test.test'), { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(poolCleared).to.be.false;
            done();
          });
        });
      });
    });

    it('should set server to unknown on non-timeout network error', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 9 }));
        } else if (doc.insert) {
          request.connection.destroy();
        } else {
          request.reply({ ok: 1 });
        }
      });

      const topology = new Topology(mockServer.uri());
      topology.connect(err => {
        expect(err).to.not.exist;

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;
          this.defer(() => topology.close());

          let serverDescription;
          server.on('descriptionReceived', sd => (serverDescription = sd));

          server.command(ns('test.test'), { insert: { a: 42 } }, (err, result) => {
            expect(result).to.not.exist;
            expect(err).to.exist;
            expect(err).to.eql(serverDescription.error);
            expect(server.description.type).to.equal('Unknown');
            done();
          });
        });
      });
    });
  });
});
