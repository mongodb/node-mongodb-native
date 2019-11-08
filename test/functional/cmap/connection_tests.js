'use strict';

const Connection = require('../../../lib/core/cmap/connection');
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

      conn.command('admin.$cmd', { ismaster: 1 }, (err, ismaster) => {
        expect(err).to.not.exist;
        expect(ismaster).to.exist;
        expect(ismaster.ok).to.equal(1);

        conn.destroy(done);
      });
    });
  });
});
