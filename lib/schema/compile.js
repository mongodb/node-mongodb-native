'use strict';

const levels = require('./levels');
const errors = require('./errors');
const assertions = require('./assertions');

function processSchema(_schema) {
  if (typeof _schema !== 'object') {
    throw new TypeError('schema must be an object, not', typeof input);
  }

  const schema = {};
  let defaultValidator = assertions.invalidParameter();

  for (let key in _schema) {
    const value = _schema[key];
    if (key === '*' && typeof value === 'function') {
      defaultValidator = value;
    } else if (typeof value === 'string') {
      schema[key] = assertions.is(value);
    } else if (typeof value === 'function') {
      schema[key] = value;
    } else {
      throw new errors.SchemaCompileError(`Schema field ${key} has invalid value ${value}`);
    }
  }

  return { schema, defaultValidator };
}

const levelHandlers = {
  [levels.error]: function(output, validator, value, i) {
    const err = validator(value, i);
    if (err) {
      throw new errors.SchemaValidationError(err);
    } else if (value !== undefined) {
      output[i] = value;
    }
  },
  [levels.warn]: function(output, validator, value, i) {
    const err = validator(value, i);
    if (err) {
      console.warn(`SchemaValidationWarning: ${err}`);
    } else if (value !== undefined) {
      output[i] = value;
    }
  },
  [levels.none]: function(output, validator, value, i) {
    if (value !== undefined) {
      output[i] = value;
    }
  }
};

// TODO: Destructure the arguments
function _transform(args) {
  const schema = args.schema;
  const input = args.input;
  const defaultValidator = args.defaultValidator;
  const levelHandler = levelHandlers[args.level] || levelHandlers.error;

  if (typeof input !== 'object') {
    levelHandler(`input must be an object, not ${typeof input}`);
  }

  const output = {};
  for (let i in input) {
    const validator = schema[i] || defaultValidator;
    const value = input[i];

    levelHandler(output, validator, value, i);
  }

  return output;
}

function compile(_schema) {
  const _processed = processSchema(_schema);
  const schema = _processed.schema;
  const defaultValidator = _processed.defaultValidator;

  return (input, level) => _transform({ input, schema, defaultValidator, level });
}

module.exports = { compile };
