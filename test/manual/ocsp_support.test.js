'use strict';
const MongoClient = require('../mongodb').MongoClient;
const expect = require('chai').expect;
const { LEGACY_HELLO_COMMAND } = require('../mongodb');

const OCSP_TLS_SHOULD_SUCCEED = process.env.OCSP_TLS_SHOULD_SUCCEED;
const CA_FILE = process.env.CA_FILE;
// NOTE: this file is NOT run through the normal test runner
describe('OCSP Support', function () {
  before(function () {
    if (OCSP_TLS_SHOULD_SUCCEED == null || CA_FILE == null) {
      this.skip();
    }
  });
  function connect(options, done) {
    const client = new MongoClient(
      `mongodb://localhost:27017/?serverSelectionTimeoutMS=500&tlsCAFile=${CA_FILE}&${options}`
    );
    client.connect(err => {
      if (err) return done(err);
      client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 }, err => {
        client.close(err2 => done(err || err2));
      });
    });
  }

  it('should support OCSP with tlsInsecure', function (done) {
    // should always succeed
    connect('tls=true&tlsInsecure=true', done);
  });

  it('should support OCSP with tlsAllowInvalidCertificates', function (done) {
    // should always succeed
    connect('tls=true&tlsAllowInvalidCertificates=true', done);
  });

  it('should support OCSP with `tls=true`', function (done) {
    connect('tls=true', err => {
      if (OCSP_TLS_SHOULD_SUCCEED) {
        expect(err).to.not.exist;
        return done();
      }
      expect(err).to.exist;
      expect(err).to.match(/invalid status response/);
      done();
    });
  });
});
