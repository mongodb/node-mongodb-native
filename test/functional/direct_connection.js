'use strict';

const expect = require('chai').expect;
const MongoClient = require('../../lib/mongo_client.js');

describe('directConnection uri error', function() {
  it('should (using client) throw error with SRV & directConnection from url query param', function(done) {
    const client = new MongoClient(`mongodb+srv://some-hostname/test?directConnection=true`);
    client.connect(err => {
      expect(err).to.exist;
      done();
    });
  });

  it('should (using client) throw error with SRV & directConnection from options', function(done) {
    const client = new MongoClient(`mongodb+srv://some-hostname/test`, {
      directConnection: true
    });
    client.connect(err => {
      expect(err).to.exist;
      done();
    });
  });

  it('should (using client.connect) throw error with SRV & directConnection from url query param', function(done) {
    MongoClient.connect(`mongodb+srv://some-hostname/test?directConnection=true`, err => {
      expect(err).to.exist;
      done();
    });
  });

  it('should (using client.connect) throw error with SRV & directConnection from options', function(done) {
    MongoClient.connect(
      `mongodb+srv://some-hostname/test`,
      {
        directConnection: true
      },
      err => {
        expect(err).to.exist;
        done();
      }
    );
  });
});
