'use strict';
const ReadPreference = require('../../../../lib/core/topologies/read_preference');
const Topology = require('../../../../lib/core/sdam/topology').Topology;
const Server = require('../../../../lib/core/sdam/server').Server;
const serverSelection = require('../../../../lib/core/sdam/server_selection');
const selectServers = serverSelection.selectServers;
const sc = require('../../../../lib/core/sdam/common');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('selectServers', function() {
  beforeEach(function() {
    this.sinon = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sinon.restore();
  });

  it('should error immediately if timeout exceeds start time', function(done) {
    const topology = new Topology('invalid:27019');
    const start = process.hrtime();
    start[0] = start[0] - 1;

    selectServers(topology, ReadPreference.primary, 1000, start, err => {
      expect(err).to.exist;
      done();
    });
  });

  it('should timeout if no servers are found within `serverSelectionTimeoutMS`', function(done) {
    const topology = new Topology('someserver:27019');
    topology.s.state = sc.STATE_CONNECTED; // fake that we are already connected

    selectServers(topology, ReadPreference.primary, 500, process.hrtime(), err => {
      expect(err).to.exist;
      expect(err).to.match(/Server selection timed out/);
      expect(err).to.have.property('reason');

      done();
    });
  });

  it('should schedule monitoring if no suitable server is found', function(done) {
    const topology = new Topology('someserver:27019');
    const requestCheck = this.sinon.stub(Server.prototype, 'requestCheck');

    this.sinon
      .stub(Topology.prototype, 'selectServer')
      .callsFake(function(selector, options, callback) {
        const server = Array.from(this.s.servers.values())[0];
        callback(null, server);
      });

    this.sinon.stub(Server.prototype, 'connect').callsFake(function() {
      this.emit('connect');
    });

    topology.connect(() => {
      selectServers(topology, ReadPreference.primary, 1000, process.hrtime(), err => {
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
      this.emit('connect');
    });

    topology.close(() => {
      selectServers(topology, ReadPreference.primary, 2000, process.hrtime(), err => {
        expect(err).to.exist;
        expect(err).to.match(/Topology is closed/);
        done();
      });
    });
  });
});
