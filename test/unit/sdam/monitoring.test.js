'use strict';
const mock = require('mongodb-mock-server');
const Topology = require('../../../lib/core/sdam/topology').Topology;
const expect = require('chai').expect;

describe('monitoring', function() {
  let server;

  after(() => mock.cleanup());
  beforeEach(function() {
    return mock.createServer().then(_server => (server = _server));
  });

  it('should record roundTripTime', function(done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    // set `heartbeatFrequencyMS` to 250ms to force a quick monitoring check, and wait 500ms to validate below
    const topology = new Topology(server.uri(), { heartbeatFrequencyMS: 250 });
    topology.connect(err => {
      expect(err).to.not.exist;

      setTimeout(() => {
        expect(topology)
          .property('description')
          .property('servers')
          .to.have.length(1);

        const serverDescription = Array.from(topology.description.servers.values())[0];
        expect(serverDescription)
          .property('roundTripTime')
          .to.be.greaterThan(0);

        topology.close(done);
      }, 500);
    });
  });
});
