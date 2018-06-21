'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
require('mocha-sinon');
const deprecate = require('../../lib/utils').deprecate;
const exec = require('child_process').exec;

function makeTestFunction(config) {
  config.fn = options => {
    if (options) options = null;
  };
  return deprecate(config);
}

describe('Deprecation Warnings', function() {
  let messages = [];
  const deprecatedParams = ['maxScan', 'snapshot', 'fields'];
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

  afterEach(function() {
    messages.length = 0;
  });

  it('multiple functions with the same deprecated params should both warn', function(done) {
    const f1 = makeTestFunction({
      fName: 'f1',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    const f2 = makeTestFunction({
      fName: 'f2',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    f1({ maxScan: 5 });
    f2({ maxScan: 5 });
    process.nextTick(() => {
      expect(messages).to.deep.equal([
        'f1 parameter [maxScan]' + defaultMessage,
        'f2 parameter [maxScan]' + defaultMessage
      ]);
      expect(messages).to.have.a.lengthOf(2);
      done();
    });
  });

  it('should not warn if no deprecated params passed in', function(done) {
    const f = makeTestFunction({
      fName: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    f({});
    process.nextTick(() => {
      expect(messages).to.have.a.lengthOf(0);
      done();
    });
  });

  it('should output manually inputted message if specified', function(done) {
    const f = makeTestFunction({
      fName: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0,
      msg: 'manual message'
    });
    f({ maxScan: 5, fields: 'hi', snapshot: true });
    process.nextTick(() => {
      expect(messages).to.deep.equal(['manual message', 'manual message', 'manual message']);
      expect(messages).to.have.a.lengthOf(3);
      done();
    });
  });

  it('each function should only warn once per deprecated parameter', function(done) {
    const f = makeTestFunction({
      fName: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    f({ maxScan: 5, fields: 'hi' });
    f({ maxScan: 5, fields: 'hi' });
    process.nextTick(() => {
      expect(messages).to.deep.equal([
        'f parameter [maxScan]' + defaultMessage,
        'f parameter [fields]' + defaultMessage
      ]);
      expect(messages).to.have.a.lengthOf(2);
      done();
    });
  });

  it('each deprecated function should warn only once', function(done) {
    const f1 = deprecate({ fn: function() {}, fName: 'f1', deprecateFunction: true });
    const f2 = deprecate({ fn: function() {}, fName: 'f2', deprecateFunction: true });
    f1();
    f2();
    f2();
    f1();
    process.nextTick(() => {
      expect(messages).to.deep.equal(['f1' + defaultMessage, 'f2' + defaultMessage]);
      expect(messages).to.have.a.lengthOf(2);
      done();
    });
  });

  it('if function and some of its parameters are deprecated, should warn for both cases', function(done) {
    const f = makeTestFunction({
      fName: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0,
      deprecateFunction: true
    });
    f({ maxScan: 5, fields: 'hi' });
    process.nextTick(() => {
      expect(messages).to.deep.equal([
        'f' + defaultMessage,
        'f parameter [maxScan]' + defaultMessage,
        'f parameter [fields]' + defaultMessage
      ]);
      expect(messages).to.have.a.lengthOf(3);
      done();
    });
  });

  it('node --no-deprecation flag should suppress all deprecation warnings', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      exec(
        'node --no-deprecation ./test/deprecate_warning_test_program.js',
        (err, stdout, stderr) => {
          expect(err).to.be.null;
          expect(stdout).to.be.empty;
          expect(stderr).to.be.empty;
          done();
        }
      );
    }
  });

  it('node --trace-deprecation flag should print stack trace to stderr', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
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
    }
  });

  it('node --throw-deprecation flag should throw error when deprecated function is called', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
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
    }
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
