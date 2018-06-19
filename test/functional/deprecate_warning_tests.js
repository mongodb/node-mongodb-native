'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
require('mocha-sinon');
const deprecate = require('../../lib/utils').deprecate;
// const deprecateFunctions = require('util').deprecate;
const util = require('util');

describe('Deprecation Warnings', function() {
  before(function() {
    return setupDatabase(this.configuration, []);
  });

  beforeEach(function() {
    this.sinon.stub(console, 'warn');
    const hi = this.sinon.stub(util, 'deprecate');
    console.log(hi.wrappedMethod);
  });

  // it('collection find deprecate warning test', function(done) {
  //   const configuration = this.configuration;
  //   const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

  //   client.connect(function(err, client) {
  //     const db = client.db(configuration.db);
  //     let collection, cursor;
  //     const close = e => cursor.close(() => client.close(() => done(e)));

  //     Promise.resolve()
  //       .then(() => db.createCollection('deprecation_test'))
  //       .then(() => (collection = db.collection('deprecation_test')))
  //       .then(() => collection.find({}, { maxScan: 5, fields: 'hi', snapshot: true }))
  //       .then(_cursor => (cursor = _cursor))
  //       .then(() => expect(console.warn.calledThrice).to.be.true)
  //       .then(
  //         () =>
  //           expect(
  //             console.warn.calledWith(
  //               '[Deprecation Warning] collection.find parameter [maxScan] is deprecated, and will be removed in a later version.'
  //             )
  //           ).to.be.true
  //       )
  //       .then(
  //         () =>
  //           expect(
  //             console.warn.calledWith(
  //               '[Deprecation Warning] collection.find parameter [fields] is deprecated, and will be removed in a later version.'
  //             )
  //           ).to.be.true
  //       )
  //       .then(
  //         () =>
  //           expect(
  //             console.warn.calledWith(
  //               '[Deprecation Warning] collection.find parameter [snapshot] is deprecated, and will be removed in a later version.'
  //             )
  //           ).to.be.true
  //       )
  //       .then(() => close())
  //       .catch(e => close(e));
  //   });
  // });

  // it('db createCollection deprecate warning test', function(done) {
  //   const configuration = this.configuration;
  //   const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

  //   client.connect(function(err, client) {
  //     const db = client.db(configuration.db);
  //     const close = e => client.close(() => done(e));

  //     Promise.resolve()
  //       .then(() => db.createCollection('deprecation_test', { autoIndexId: 1 }))
  //       .then(() => expect(console.warn.calledOnce).to.be.true)
  //       .then(
  //         () =>
  //           expect(
  //             console.warn.calledWith(
  //               '[Deprecation Warning] db.createCollection parameter [autoIndexId] is deprecated, and will be removed in a later version.'
  //             )
  //           ).to.be.true
  //       )
  //       .then(() => close())
  //       .catch(e => close(e));
  //   });
  // });

  const tester = deprecate(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester',
    { deprecatedParams: new Set(['maxScan', 'snapshot', 'fields']), optionsIndex: 0 }
  );

  const tester2 = deprecate(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester2',
    { deprecatedParams: new Set(['maxScan', 'snapshot', 'fields']), optionsIndex: 0 }
  );

  it('multiple functions with the same deprecated params deprecate warning test', function(done) {
    Promise.resolve()
      .then(() => tester({ maxScan: 5 }))
      .then(() => tester2({ maxScan: 5 }))
      .then(() => expect(console.warn.calledTwice).to.be.true)
      .then(
        () =>
          expect(
            console.warn.calledWith(
              'DeprecationWarning: Tester parameter [maxScan] is deprecated and will be removed in a later version.'
            )
          ).to.be.true
      )
      .then(
        () =>
          expect(
            console.warn.calledWith(
              'DeprecationWarning: Tester2 parameter [maxScan] is deprecated and will be removed in a later version.'
            )
          ).to.be.true
      )
      .then(() => done())
      .catch(e => done(e));
  });

  const tester3 = deprecate(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester3',
    { deprecatedParams: new Set(['maxScan', 'snapshot', 'fields']), optionsIndex: 0 }
  );

  it('no deprecated params passed in deprecate warning test', function(done) {
    Promise.resolve()
      .then(() => tester3({}, {}))
      .then(() => expect(console.warn.called).to.be.false)
      .then(() => done())
      .catch(e => done(e));
  });

  const tester4 = deprecate(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester4',
    {
      deprecatedParams: new Set(['maxScan', 'snapshot', 'fields']),
      optionsIndex: 0,
      msg: 'manual message'
    }
  );

  it('manually inputted message test', function(done) {
    Promise.resolve()
      .then(() => tester4({ maxScan: 5, fields: 'hi', snapshot: true }))
      .then(() => expect(console.warn.calledThrice).to.be.true)
      .then(() => expect(console.warn.calledWith('DeprecationWarning: manual message')).to.be.true)
      .then(() => done())
      .catch(e => done(e));
  });

  const tester5 = deprecate(
    function(options) {
      if (options) {
        options = null;
      }
    },
    'Tester5',
    { deprecatedParams: new Set(['maxScan', 'snapshot', 'fields']), optionsIndex: 0 }
  );

  it('same function only warns once per deprecated parameter', function(done) {
    Promise.resolve()
      .then(() => tester5({ maxScan: 5, fields: 'hi' }))
      .then(() => tester5({ maxScan: 5, fields: 'hi' }))
      .then(() => expect(console.warn.calledTwice).to.be.true)
      .then(
        () =>
          expect(
            console.warn.calledWith(
              'DeprecationWarning: Tester5 parameter [maxScan] is deprecated and will be removed in a later version.'
            )
          ).to.be.true
      )
      .then(
        () =>
          expect(
            console.warn.calledWith(
              'DeprecationWarning: Tester5 parameter [fields] is deprecated and will be removed in a later version.'
            )
          ).to.be.true
      )
      .then(() => done())
      .catch(e => done(e));
  });

  // it('logger test for deprecation', function(done) {
  //   const configuration = this.configuration;
  //   const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
  //   const Logger = this.configuration.require.Logger;

  //   client.connect(function(err, client) {
  //     const db = client.db(configuration.db);
  //     let collection, cursor;
  //     const close = e => cursor.close(() => client.close(() => done(e)));

  //     Logger.setLevel('warn');

  //     Logger.setCurrentLogger(function(msg, context) {
  //       expect(msg).to.exist;
  //       console.log('warn msg: ' + msg);
  //     });

  //     Promise.resolve()
  //       .then(() => db.createCollection('log_test_deprecation'))
  //       .then(() => (collection = db.collection('log_test_deprecation')))
  //       .then(() => collection.find({}, { maxScan: 5, fields: 'hi', snapshot: true }))
  //       .then(() => collection.find({}, { maxScan: 5, fields: 'hi', snapshot: true }))
  //       .then(_cursor => (cursor = _cursor))
  //       .then(() => close())
  //       .catch(e => close(e));
  //   });
  // });

  // const tester6 = deprecate(function() {}, 'Tester6', {});

  // it('deprecated function test', function(done) {
  //   Promise.resolve()
  //     .then(() => tester6())
  //     .then(() => expect(util.deprecate.calledOnce).to.be.true)
  //     // .then(
  //     //   () =>
  //     //     expect(
  //     //       deprecateFunction.calledWith(
  //     //         tester6,
  //     //         'DeprecationWarning: Tester6 is deprecated and will be removed in a later version.'
  //     //       )
  //     //     ).to.be.true
  //     // )
  //     .then(() => done())
  //     .catch(e => done(e));
  // });

  //   it('logging deprecated warnings test', function(done) {
  //     done();
  //   });
});
