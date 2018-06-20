'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
require('mocha-sinon');
const deprecate = require('../../lib/utils').deprecate;
const exec = require('child_process').exec;

function makeTestFunction(fName, config) {
  return deprecate(
    function(options) {
      if (options) {
        options = null;
      }
    },
    fName,
    config
  );
}

describe('Deprecation Warnings', function() {
  let messages = [];
  const deprecatedParams = new Set(['maxScan', 'snapshot', 'fields']);
  const defaultMessage = ' is deprecated and will be removed in a later version.';

  before(function() {
    process.on('warning', warning => {
      messages.push(warning.message);
    });
    return setupDatabase(this.configuration, []);
  });

  beforeEach(function() {
    this.sinon.stub(console, 'error');
  });

  it('multiple functions with the same deprecated params deprecate warning test', function(done) {
    const f1 = makeTestFunction('f1', {
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    const f2 = makeTestFunction('f2', {
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    messages.length = 0;
    f1({ maxScan: 5 });
    f2({ maxScan: 5 });
    process.nextTick(() => {
      expect(messages[0]).to.equal('f1 parameter [maxScan]' + defaultMessage);
      expect(messages[1]).to.equal('f2 parameter [maxScan]' + defaultMessage);
      expect(messages.length).to.equal(2);
      done();
    });
  });

  it('no deprecated params passed in deprecate warning test', function(done) {
    const f = makeTestFunction('f', {
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    messages.length = 0;
    f({}, {});
    process.nextTick(() => {
      expect(messages.length).to.equal(0);
      done();
    });
  });

  it('manually inputted message test', function(done) {
    const f = makeTestFunction('f', {
      deprecatedParams: deprecatedParams,
      optionsIndex: 0,
      msg: 'manual message'
    });
    messages.length = 0;
    f({ maxScan: 5, fields: 'hi', snapshot: true });
    process.nextTick(() => {
      expect(messages[0]).to.equal('manual message');
      expect(messages[1]).to.equal('manual message');
      expect(messages[2]).to.equal('manual message');
      expect(messages.length).to.equal(3);
      done();
    });
  });

  it('same function only warns once per deprecated parameter', function(done) {
    const f = makeTestFunction('f', {
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    messages.length = 0;
    f({ maxScan: 5, fields: 'hi' });
    f({ maxScan: 5, fields: 'hi' });
    process.nextTick(() => {
      expect(messages[0]).to.equal('f parameter [maxScan]' + defaultMessage);
      expect(messages[1]).to.equal('f parameter [fields]' + defaultMessage);
      expect(messages.length).to.equal(2);
      done();
    });
  });

  it('deprecated function test', function(done) {
    const f1 = deprecate(function() {}, 'f1', {});
    const f2 = deprecate(function() {}, 'f2', {});
    messages.length = 0;
    f1();
    f2();
    process.nextTick(() => {
      expect(messages[0]).to.equal('f1' + defaultMessage);
      expect(messages[1]).to.equal('f2' + defaultMessage);
      expect(messages.length).to.equal(2);
      done();
    });
  });

  it('function and parameter deprecation', function(done) {
    const f = makeTestFunction('f', {
      deprecatedParams: deprecatedParams,
      optionsIndex: 0,
      both: true
    });
    messages.length = 0;
    f({ maxScan: 5, fields: 'hi' });
    process.nextTick(() => {
      expect(messages[0]).to.equal('f' + defaultMessage);
      expect(messages[1]).to.equal('f parameter [maxScan]' + defaultMessage);
      expect(messages[2]).to.equal('f parameter [fields]' + defaultMessage);
      expect(messages.length).to.equal(3);
      done();
    });
  });

  it('node --no-deprecation flag should suppress all deprecation warnings', function(done) {
    exec(
      'node --no-deprecation ./test/deprecate_warning_test_program.js',
      (err, stdout, stderr) => {
        expect(err).to.be.null;
        expect(stdout).to.be.empty;
        expect(stderr).to.be.empty;
        done();
      }
    );
  });

  it('node --trace-deprecation flag should print stack trace to stderr', function(done) {
    exec(
      'node --trace-deprecation ./test/deprecate_warning_test_program.js',
      (err, stdout, stderr) => {
        expect(err).to.be.null;
        expect(stdout).to.be.empty;
        expect(stderr).to.not.be.empty;

        const split = stderr.split('\n');
        const warning = split
          .shift()
          .split(')')[1]
          .trim();

        // ensure warning is the first line printed
        expect(warning).to.equal(
          'DeprecationWarning: testDeprecationFlags parameter [maxScan]' + defaultMessage
        );

        // ensure each following line is from the stack trace, i.e. 'at config.deprecatedParams.forEach.deprecatedParam'
        split.pop();
        split.forEach(s => {
          expect(s.trim()).to.match(/^at/);
        });

        done();
      }
    );
  });

  it('node --throw-deprecation flag should throw error when deprecated function is called', function(done) {
    exec(
      'node --throw-deprecation ./test/deprecate_warning_test_program.js this_arg_should_never_print',
      (err, stdout, stderr) => {
        expect(stderr).to.not.be.empty;
        expect(err).to.not.be.null;
        expect(err)
          .to.have.own.property('code')
          .that.equals(1);

        // ensure stdout is empty, i.e. that the program threw an error before reaching the console.log statement
        expect(stdout).to.be.empty;
        done();
      }
    );
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
});
