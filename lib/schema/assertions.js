'use strict';

const SchemaCompileError = require('./errors').SchemaCompileError;
const isObjectRaw = require('../utils').isObject;

// Raw Asserters
function _invalidParameter(value, key) {
  return `Invalid option ${key}`;
}

function _equals(value, key, expectedValue) {
  if (value !== expectedValue) {
    return `Expected option "${key}"=${value} to equal ${expectedValue}`;
  }
}

function _isArray(value, key) {
  if (!Array.isArray(value)) {
    return `Expected option "${key}"=${value} to be an Array`;
  }
}

function _isObject(value, key) {
  if (!isObjectRaw(value)) {
    return `Expected option "${key}"=${value} to be a plain Object`;
  }
}

function _isType(value, key, expectedType) {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    return `Expected typeof option "${key}"=${value} to equal ${expectedType}. but was ${actualType}`;
  }
}

function _isInstance(value, key, ctor) {
  if (!(value instanceof ctor)) {
    return `Expected option "${key}" to be instance of ${ctor}`;
  }
}

function _isFlag(value, key) {
  if (typeof value !== 'boolean' && value !== 0 && value !== 1) {
    return `Expected option ${key} to be boolean, 0, or 1, but was ${typeof value}`;
  }
}

function noop() {}

// Generators
function invalidParameter() {
  return _invalidParameter;
}

function equals(expectedValue) {
  return (value, key) => _equals(value, key, expectedValue);
}

function isType(expectedType) {
  return (value, key) => _isType(value, key, expectedType);
}

function isArray() {
  return _isArray;
}

function isObject() {
  return _isObject;
}

function isInstance(ctor) {
  return (value, key) => _isInstance(value, key, ctor);
}

function isFlag() {
  return _isFlag;
}

function or(assertions) {
  const arr = Array.from(arguments);
  if (arr.length > 1) {
    return or.call(null, arguments);
  }

  return (value, key) => {
    let err;
    for (let i in assertions) {
      err = assertions[i](value, key);
      if (!err) {
        return;
      }
    }
    return err;
  };
}

function and(assertions) {
  const arr = Array.from(arguments);
  if (arr.length > 1) {
    return and.call(null, arguments);
  }
  return (value, key) => {
    for (let i in assertions) {
      const err = assertions[i](value, key);
      if (err) {
        return err;
      }
    }
  };
}

function is(type) {
  if (arguments.length > 1) {
    return or(Array.from(arguments).map(arg => is(arg)));
  }

  if (Array.isArray(type)) {
    return or(type.map(arg => is(arg)));
  }

  if (typeof type === 'function') {
    return isInstance(type);
  }

  if (typeof type === 'string') {
    switch (type) {
      case '*':
        return noop;
      case 'any':
        return noop;
      case 'flag':
        return isFlag();
      case 'array':
        return isArray();
      case 'object':
        return isObject();
      default:
        return isType(type);
    }
  }

  throw new SchemaCompileError(`cannot call is with parameter of type ${typeof type}`);
}

module.exports = {
  is,
  or,
  and,
  isInstance,
  isType,
  isArray,
  isObject,
  isFlag,
  equals,
  invalidParameter
};
