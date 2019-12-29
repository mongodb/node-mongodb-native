'use strict';
const Topology = require('../../../lib/core/sdam/topology').Topology;
const Server = require('../../../lib/core/sdam/server').Server;
const ServerDescription = require('../../../lib/core/sdam/server_description').ServerDescription;
const mock = require('mongodb-mock-server');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('Topology (unit)', function() {
  describe('shouldCheckForSessionSupport', function() {
    beforeEach(function() {
      this.sinon = sinon.sandbox.create();

      // these are mocks we want across all tests
      this.sinon.stub(Server.prototype, 'requestCheck');
      this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function(selector, options, callback) {
          setTimeout(() => {
            const server = Array.from(this.s.servers.values())[0];
            callback(null, server);
          }, 50);
        });
    });

    afterEach(function() {
      this.sinon.restore();
    });

    it('should check for sessions if connected to a single server and has no known servers', function(done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
        this.s.state = 'connected';
        this.emit('connect');
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.true;
        topology.close(done);
      });
    });

    it('should not check for sessions if connected to a single server', function(done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
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

    it('should check for sessions if there are no data-bearing nodes', function(done) {
      const topology = new Topology('mongos:27019,mongos:27018,mongos:27017');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
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

  describe('black holes', function() {
    let mockServer;
    beforeEach(() => mock.createServer().then(server => (mockServer = server)));
    afterEach(() => mock.cleanup());

    it('should time out operations against servers that have been blackholed', function(done) {
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

        topology.command('admin.$cmd', { ping: 1 }, { socketTimeout: 250 }, (err, result) => {
          expect(result).to.not.exist;
          expect(err).to.exist;
          expect(err).to.match(/timed out/);

          topology.close(done);
        });
      });
    });
  });
});
