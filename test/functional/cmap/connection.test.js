'use strict';

const Connection = require('../../../lib/core/cmap/connection').Connection;
const connect = require('../../../lib/core/connection/connect');
const expect = require('chai').expect;
const BSON = require('bson');

describe('Connection', function() {
  it('should execute a command against a server', function(done) {
    const connectOptions = Object.assign(
      { connectionType: Connection, bson: new BSON() },
      this.configuration.options
    );

    connect(connectOptions, (err, conn) => {
      expect(err).to.not.exist;
      this.defer(_done => conn.destroy(_done));

      conn.command('admin.$cmd', { ismaster: 1 }, (err, ismaster) => {
        expect(err).to.not.exist;
        expect(ismaster).to.exist;
        expect(ismaster.ok).to.equal(1);
        done();
      });
    });
  });

  it('should emit command monitoring events', function(done) {
    const connectOptions = Object.assign(
      { connectionType: Connection, bson: new BSON(), monitorCommands: true },
      this.configuration.options
    );

    connect(connectOptions, (err, conn) => {
      expect(err).to.not.exist;
      this.defer(_done => conn.destroy(_done));

      const events = [];
      conn.on('commandStarted', event => events.push(event));
      conn.on('commandSucceeded', event => events.push(event));
      conn.on('commandFailed', event => events.push(event));

      conn.command('admin.$cmd', { ismaster: 1 }, (err, ismaster) => {
        expect(err).to.not.exist;
        expect(ismaster).to.exist;
        expect(ismaster.ok).to.equal(1);
        expect(events).to.have.length(2);
        done();
      });
    });
  });
});
