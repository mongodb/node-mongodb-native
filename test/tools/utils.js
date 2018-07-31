'use strict';

const Logger = require('mongodb-core').Logger;
const deprecateOptions = require('../../lib/utils').deprecateOptions;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
chai.use(sinonChai);

function makeTestFunction(config) {
  const fn = options => {
    if (options) options = null;
  };
  return deprecateOptions(config, fn);
}

function ensureCalledWith(stub, args) {
  args.forEach(m => expect(stub).to.have.been.calledWith(m));
}

// creation of class with a logger
function ClassWithLogger() {
  this.logger = new Logger('ClassWithLogger');
}

ClassWithLogger.prototype.f = makeTestFunction({
  name: 'f',
  deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
  optionsIndex: 0
});

ClassWithLogger.prototype.getLogger = function() {
  return this.logger;
};

// creation of class without a logger
function ClassWithoutLogger() {}

ClassWithoutLogger.prototype.f = makeTestFunction({
  name: 'f',
  deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
  optionsIndex: 0
});

// creation of class where getLogger returns undefined
function ClassWithUndefinedLogger() {}

ClassWithUndefinedLogger.prototype.f = makeTestFunction({
  name: 'f',
  deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
  optionsIndex: 0
});

ClassWithUndefinedLogger.prototype.getLogger = function() {
  return undefined;
};

module.exports = {
  makeTestFunction,
  ensureCalledWith,
  ClassWithLogger,
  ClassWithoutLogger,
  ClassWithUndefinedLogger
};
