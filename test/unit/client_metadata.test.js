'use strict';
const mock = require('mongodb-mock-server');
const expect = require('chai').expect;

describe('Client Metadata', function() {
  let mockServer;
  before(() => mock.createServer().then(server => (mockServer = server)));
  after(() => mock.cleanup());

  it('should report the correct platform in client metadata', function(done) {
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

    const isUnifiedTopology = this.configuration.usingUnifiedTopology();
    const client = this.configuration.newClient(`mongodb://${mockServer.uri()}/`);
    client.connect(err => {
      expect(err).to.not.exist;
      this.defer(() => client.close());

      client.db().command({ ping: 1 }, err => {
        expect(err).to.not.exist;

        if (isUnifiedTopology) {
          expect(ismasters).to.have.length.greaterThan(1);
          ismasters.forEach(ismaster =>
            expect(ismaster)
              .nested.property('client.platform')
              .to.match(/unified/)
          );
        } else {
          expect(ismasters).to.have.length(1);
          ismasters.forEach(ismaster =>
            expect(ismaster)
              .nested.property('client.platform')
              .to.match(/legacy/)
          );
        }

        done();
      });
    });
  });
});
