'use strict';
const test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  expect = require('chai').expect;
const { MongoClient } = require('../../src');

describe('MongoClient Options', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('should error on unexpected options', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration;
      MongoClient.connect(
        configuration.url(),
        {
          autoReconnect: true,
          poolSize: 4,
          notlegal: {},
          validateOptions: true
        },
        function(err, client) {
          test.ok(err.message.indexOf('option notlegal is not supported') !== -1);
          expect(client).to.not.exist;
          done();
        }
      );
    }
  });
});
