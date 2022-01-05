'use strict';
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

describe('Deprecation Warnings - functional', function () {
  beforeEach(function () {
    this.sinon.stub(console, 'error');
  });

  it('test behavior for classes with an associated logger', function () {
    const fakeClass = new ClassWithLogger();
    const logger = fakeClass.getLogger();
    const stub = sinon.stub(logger, 'warn');

    fakeClass.f({ maxScan: 5, snapshot: true });
    fakeClass.f({ maxScan: 5, snapshot: true });
    expect(stub).to.have.been.calledTwice;
    ensureCalledWith(stub, [
      'f option [maxScan] is deprecated and will be removed in a later version.',
      'f option [snapshot] is deprecated and will be removed in a later version.'
    ]);
  });

  it('test behavior for classes without an associated logger', function () {
    const fakeClass = new ClassWithoutLogger();

    function func() {
      fakeClass.f({ maxScan: 5, snapshot: true });
    }

    expect(func).to.not.throw();
  });

  it('test behavior for classes with an undefined logger', function () {
    const fakeClass = new ClassWithUndefinedLogger();

    function func() {
      fakeClass.f({ maxScan: 5, snapshot: true });
    }

    expect(func).to.not.throw();
  });
});
