'use strict';
const Topology = require('../../../lib/core/sdam/topology').Topology;
const Server = require('../../../lib/core/sdam/server').Server;
const ServerDescription = require('../../../lib/core/sdam/server_description').ServerDescription;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('Topology (unit)', function() {
  describe('shouldCheckForSessionSupport', function() {
    beforeEach(function() {
      this.sinon = sinon.sandbox.create();

      // these are mocks we want across all tests
      this.sinon.stub(Server.prototype, 'monitor');
      this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function(selector, options, callback) {
          const server = Array.from(this.s.servers.values())[0];
          callback(null, server);
        });
    });

    afterEach(function() {
      this.sinon.restore();
    });

    it('should check for sessions if connected to a single server and has no known servers', function(done) {
      const topology = new Topology('someserver:27019');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
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
        this.emit(
          'descriptionReceived',
          new ServerDescription('someserver:27019', { ok: 1, maxWireVersion: 5 })
        );

        this.emit('connect');
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });

    it('should check for sessions if there are no data-bearing nodes', function(done) {
      const topology = new Topology('mongos:27019,mongos:27018,mongos:27017');
      this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
        this.emit(
          'descriptionReceived',
          new ServerDescription(this.name, { ok: 1, msg: 'isdbgrid', maxWireVersion: 5 })
        );

        this.emit('connect');
      });

      topology.connect(() => {
        expect(topology.shouldCheckForSessionSupport()).to.be.false;
        topology.close(done);
      });
    });
  });
});
