'use strict';

const SYMBOL_ANY = Symbol('[[any]]');

function transformSpecCompare(obj) {
  if (obj === 42 || obj === '42') {
    return SYMBOL_ANY;
  }

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(transformSpecCompare);
  }

  return Object.keys(obj).reduce((memo, key) => {
    memo[key] = transformSpecCompare(obj[key]);
    return memo;
  }, {});
}

function matchSpecCompare(expected, actual) {
  const typeOfExpected = typeof expected;

  if (expected === 42 || expected === '42') {
    return actual != null;
  }

  if (typeOfExpected !== typeof actual) {
    return false;
  }

  if (typeOfExpected !== 'object' || expected == null) {
    return expected === actual;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }

    return expected.every((val, idx) => matchSpecCompare(val, actual[idx]));
  } else if (expected instanceof Date) {
    return actual instanceof Date ? expected.getTime() === actual.getTime() : false;
  }

  return Object.keys(expected).every(key => matchSpecCompare(expected[key], actual[key]));
}

function matchSpec(chai, utils) {
  chai.Assertion.addMethod('matchSpec', function(expected) {
    const actual = utils.flag(this, 'object');

    chai.Assertion.prototype.assert.call(
      this,
      matchSpecCompare(expected, actual),
      'expected #{act} to match spec #{exp}',
      'expected #{act} to not match spec #{exp}',
      transformSpecCompare(expected),
      actual,
      chai.config.showDiff
    );
  });

  chai.assert.matchSpec = function(val, exp, msg) {
    new chai.Assertion(val, msg).to.matchSpec(exp);
  };
}

module.exports.default = matchSpec;
