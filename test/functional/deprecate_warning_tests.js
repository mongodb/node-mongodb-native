'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
require('mocha-sinon');
const deprecateParams = require('../../lib/utils').deprecateParams;

describe('Deprecation Warnings', function() {
  before(function() {
    return setupDatabase(this.configuration, []);
  });

  beforeEach(function() {
    this.sinon.stub(console, 'warn');
  });

  it('collection find deprecate warning test', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

    client.connect(function(err, client) {
      const db = client.db(configuration.db);
      let collection, cursor;
      const close = e => cursor.close(() => client.close(() => done(e)));

      Promise.resolve()
        .then(() => db.createCollection('deprecation_test'))
        .then(() => (collection = db.collection('deprecation_test')))
        .then(() => collection.find({}, { maxScan: 5, fields: 'hi', snapshot: true }))
        .then(_cursor => (cursor = _cursor))
        .then(() => expect(console.warn.calledThrice).to.be.true)
        .then(() => close())
        .catch(e => close(e));
    });
  });

  const tester = deprecateParams(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester',
    new Set(['maxScan', 'snapshot', 'fields']),
    0
  );

  const tester2 = deprecateParams(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester2',
    new Set(['maxScan', 'snapshot', 'fields']),
    0
  );

  it('multiple functions with the same deprecated params deprecate warning test', function(done) {
    Promise.resolve()
      .then(() => tester({ maxScan: 5 }))
      .then(() => tester2({ maxScan: 5 }))
      .then(() => expect(console.warn.calledTwice).to.be.true)
      .then(() => done());
  });

  const tester3 = deprecateParams(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester3',
    new Set(['maxScan', 'snapshot', 'fields']),
    0
  );

  it('no deprecated params passed in deprecate warning test', function(done) {
    Promise.resolve()
      .then(() => tester3({}, {}))
      .then(() => expect(console.warn.called).to.be.false)
      .then(() => done());
  });

  const tester4 = deprecateParams(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester4',
    new Set(['maxScan', 'snapshot', 'fields']),
    0,
    'manual message'
  );

  it('manually inputted message test', function(done) {
    Promise.resolve()
      .then(() => tester4({ maxScan: 5, fields: 'hi', snapshot: true }))
      .then(() => expect(console.warn.calledWith('manual message')).to.be.true)
      .then(() => done());
  });

  const tester5 = deprecateParams(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester5',
    new Set(['maxScan', 'snapshot', 'fields']),
    0
  );

  it('same function only warns once per deprecated parameter', function(done) {
    Promise.resolve()
      .then(() => tester5({ maxScan: 5 }))
      .then(() => tester5({ maxScan: 5 }))
      .then(() => expect(console.warn.calledOnce).to.be.true)
      .then(() => done());
  });

  it('logger test for deprecation', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
    const Logger = this.configuration.require.Logger;

    client.connect(function(err, client) {
      const db = client.db(configuration.db);
      let collection, cursor;
      const close = e => cursor.close(() => client.close(() => done(e)));

      Logger.setLevel('warn');

      Logger.setCurrentLogger(function(msg, context) {
        expect(msg).to.exist;
        console.log('warn msg: ' + msg);
      });

      Promise.resolve()
        .then(() => db.createCollection('log_test_deprecation'))
        .then(() => (collection = db.collection('log_test_deprecation')))
        .then(() => collection.find({}, { maxScan: 5, fields: 'hi', snapshot: true }))
        .then(() => collection.find({}, { maxScan: 5, fields: 'hi', snapshot: true }))
        .then(_cursor => (cursor = _cursor))
        .then(() => close())
        .catch(e => close(e));
    });
  });
});
