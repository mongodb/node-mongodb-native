'use strict';
const { Topology } = require('../../../../src/sdam/topology');
const { Server } = require('../../../../src/sdam/server');
const { ReadPreference } = require('../../../../src/read_preference');
const { expect } = require('chai');
const sinon = require('sinon');

describe('selectServer', function () {
  beforeEach(function () {
    this.sinon = sinon.sandbox.create();
  });

  afterEach(function () {
    this.sinon.restore();
  });

  it('should schedule monitoring if no suitable server is found', function (done) {
    const topology = new Topology('someserver:27019');
    const requestCheck = this.sinon.stub(Server.prototype, 'requestCheck');

    // satisfy the initial connect, then restore the original method
    const selectServer = this.sinon
      .stub(Topology.prototype, 'selectServer')
      .callsFake(function (selector, options, callback) {
        const server = Array.from(this.s.servers.values())[0];
        selectServer.restore();
        callback(null, server);
      });

    this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
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
        expect(requestCheck).property('callCount').to.equal(1);

        topology.close(done);
      });
    });
  });

  it('should disallow selection when the topology is explicitly closed', function (done) {
    const topology = new Topology('someserver:27019');
    this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
      this.s.state = 'connected';
      this.emit('connect');
    });

    topology.close(() => {
      topology.selectServer(ReadPreference.primary, { serverSelectionTimeoutMS: 2000 }, err => {
        expect(err).to.exist;
        expect(err).to.match(/Topology has been closed/);
        done();
      });
    });
  });

  describe('waitQueue', function () {
    it('should process all wait queue members, including selection with errors', function (done) {
      const topology = new Topology('someserver:27019');
      const selectServer = this.sinon
        .stub(Topology.prototype, 'selectServer')
        .callsFake(function (selector, options, callback) {
          const server = Array.from(this.s.servers.values())[0];
          selectServer.restore();
          callback(null, server);
        });

      this.sinon.stub(Server.prototype, 'connect').callsFake(function () {
        this.s.state = 'connected';
        this.emit('connect');
      });

      const toSelect = 10;
      let completed = 0;
      function finish() {
        completed++;
        if (completed === toSelect) done();
      }

      // methodology:
      //   - perform 9 server selections, a few with a selector that throws an error
      //   - ensure each selection immediately returns an empty result (gated by a boolean)
      //     guaranteeing tha the queue will be full before the last selection
      //   - make one last selection, but ensure that all selections are no longer blocked from
      //     returning their value
      //   - verify that 10 callbacks were called

      topology.connect(err => {
        expect(err).to.not.exist;

        let preventSelection = true;
        const anySelector = td => {
          if (preventSelection) return [];
          const server = Array.from(td.servers.values())[0];
          return [server];
        };

        const failingSelector = () => {
          if (preventSelection) return [];
          throw new TypeError('bad news!');
        };

        preventSelection = true;
        for (let i = 0; i < toSelect - 1; ++i) {
          topology.selectServer(i % 5 === 0 ? failingSelector : anySelector, finish);
        }

        preventSelection = false;
        topology.selectServer(anySelector, finish);
      });
    });
  });
});
