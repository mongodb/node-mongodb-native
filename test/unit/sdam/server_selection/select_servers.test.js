'use strict';
const ReadPreference = require('../../../../lib/core/topologies/read_preference');
const Topology = require('../../../../lib/core/sdam/topology').Topology;
const Server = require('../../../../lib/core/sdam/server').Server;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('selectServer', function() {
  beforeEach(function() {
    this.sinon = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sinon.restore();
  });

  it('should schedule monitoring if no suitable server is found', function(done) {
    const topology = new Topology('someserver:27019');
    const requestCheck = this.sinon.stub(Server.prototype, 'requestCheck');

    // satisfy the initial connect, then restore the original method
    const selectServer = this.sinon
      .stub(Topology.prototype, 'selectServer')
      .callsFake(function(selector, options, callback) {
        const server = Array.from(this.s.servers.values())[0];
        selectServer.restore();
        callback(null, server);
      });

    this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
      this.s.state = 'connected';
      this.emit('connect');
    });

    topology.connect(() => {
      topology.selectServer(ReadPreference.secondary, { serverSelectionTimeoutMS: 1000 }, err => {
        expect(err).to.exist;
        expect(err).to.match(/Server selection timed out/);
        expect(err).to.have.property('reason');

        // When server is created `connect` is called on the monitor. When server selection
        // occurs `requestCheck` will be called for an immediate check.
        expect(requestCheck)
          .property('callCount')
          .to.equal(1);

        topology.close(done);
      });
    });
  });

  it('should disallow selection when the topology is explicitly closed', function(done) {
    const topology = new Topology('someserver:27019');
    this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
      this.s.state = 'connected';
      this.emit('connect');
    });

    topology.close(() => {
      topology.selectServer(ReadPreference.primary, { serverSelectionTimeoutMS: 2000 }, err => {
        expect(err).to.exist;
        expect(err).to.match(/Topology is closed/);
        done();
      });
    });
  });
});
