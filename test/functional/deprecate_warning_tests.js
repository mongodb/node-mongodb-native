'use strict';
const exec = require('child_process').exec;
const deprecateOptions = require('../../lib/utils').deprecateOptions;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
require('mocha-sinon');
chai.use(sinonChai);
beforeEach(function() {
  this.sinon.stub(console, 'error');
});

describe('Deprecation Warnings', function() {
  const defaultMessage = ' is deprecated and will be removed in a later version.';

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
  //       // console.log('LOGGER PRINT STATEMENTS HERE');
  //       // console.log(context);
  //       expect(msg).to.exist;
  //       // console.log('warn msg: ' + msg);
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

  // setup for logger classes
  const Logger = require('mongodb-core').Logger;

  function makeTestFunction(config) {
    const fn = options => {
      if (options) options = null;
    };
    return deprecateOptions(config, fn);
  }

  // creation of class with a logger
  function ClassWithLogger() {
    this.Logger = new Logger('ClassWithLogger');
    Logger.setLevel('warn');
  }

  ClassWithLogger.prototype.f = makeTestFunction({
    name: 'f',
    deprecatedParams: ['maxScan', 'snapshot', 'fields'],
    optionsIndex: 0
  });

  ClassWithLogger.prototype.getLogger = () => {
    return this.Logger;
  };

  // creation of class without a logger
  function ClassWithoutLogger() {}

  ClassWithoutLogger.prototype.f = makeTestFunction({
    name: 'f',
    deprecatedParams: ['maxScan', 'snapshot', 'fields'],
    optionsIndex: 0
  });
});
