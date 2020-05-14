'use strict';

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));
const withMonitoredClient = require('./shared').withMonitoredClient;

describe('Write Concern', function() {
  describe('test journal connection string option', function() {
    function journalOptionTest(client, events, done) {
      expect(client).to.have.nested.property('s.options');
      const clientOptions = client.s.options;
      expect(clientOptions).property('j').to.be.true;
      client
        .db('test')
        .collection('test')
        .insertOne({ a: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;
          expect(events)
            .to.be.an('array')
            .with.lengthOf(1);
          expect(events[0]).to.containSubset({
            commandName: 'insert',
            command: {
              writeConcern: { j: true }
            }
          });
          done();
        });
    }

    // baseline to confirm client option is working
    it(
      'should set write concern with j: true client option',
      withMonitoredClient('insert', { clientOptions: { j: true } }, journalOptionTest)
    );

    // ensure query option in connection string passes through
    it(
      'should set write concern with journal=true connection string option',
      withMonitoredClient('insert', { queryOptions: { journal: true } }, journalOptionTest)
    );
  });
});
