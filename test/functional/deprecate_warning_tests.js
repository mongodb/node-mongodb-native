'use strict';
const exec = require('child_process').exec;
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
require('mocha-sinon');
chai.use(sinonChai);

const utils = require('../tools/utils');
const ClassWithLogger = utils.ClassWithLogger;
const ClassWithoutLogger = utils.ClassWithoutLogger;
const ClassWithUndefinedLogger = utils.ClassWithUndefinedLogger;
const ensureCalledWith = utils.ensureCalledWith;

describe('Deprecation Warnings', function() {
  beforeEach(function() {
    this.sinon.stub(console, 'error');
  });

  const defaultMessage = ' is deprecated and will be removed in a later version.';

  it('node --no-deprecation flag should suppress all deprecation warnings', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      exec(
        'node --no-deprecation ./test/tools/deprecate_warning_test_program.js',
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
        'node --trace-deprecation ./test/tools/deprecate_warning_test_program.js',
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
        'node --throw-deprecation ./test/tools/deprecate_warning_test_program.js this_arg_should_never_print',
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

  it('test behavior for classes with an associated logger', function() {
    const fakeClass = new ClassWithLogger();
    const logger = fakeClass.getLogger();
    const stub = sinon.stub(logger, 'warn');

    fakeClass.f({ maxScan: 5, snapshot: true });
    fakeClass.f({ maxScan: 5, snapshot: true });
    expect(stub).to.have.been.calledTwice;
    ensureCalledWith(stub, [
      'f parameter [maxScan] is deprecated and will be removed in a later version.',
      'f parameter [snapshot] is deprecated and will be removed in a later version.'
    ]);
  });

  it('test behavior for classes without an associated logger', function() {
    const fakeClass = new ClassWithoutLogger();

    fakeClass.f({ maxScan: 5, snapshot: true });
  });

  it('test behavior for classes with an undefined logger', function() {
    const fakeClass = new ClassWithUndefinedLogger();

    fakeClass.f({ maxScan: 5, snapshot: true });
  });
});
