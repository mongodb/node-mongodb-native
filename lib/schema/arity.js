'use strict';

const compile = require('./compile').compile;
const levels = require('./levels');

const DEFAULT_VALIDATION_LEVEL = levels[process.env.MONGO_DRIVER_VALIDATION_LEVEL] || 'warn';

function getValidator(validator, defaultValidator) {
  const t = typeof validator;

  if (t === 'function') {
    return validator;
  } else if (t === 'object' && t != null) {
    return compile(validator);
  }

  return defaultValidator;
}

function copy(x) {
  if (typeof x !== 'object') {
    return x;
  }
  return Object.assign(Array.isArray(x) ? [] : {}, x);
}

const defaultOptionalValidator = x => Object.assign({}, x);

function getValidationLevel(ctx) {
  let level = DEFAULT_VALIDATION_LEVEL;
  if (ctx) {
    level = ctx.validationLevel || (ctx.s && ctx.s.validationLevel) || level;
  }
  return level;
}

function makeNArityFn(arity, options) {
  if (!options || !options.fn) {
    throw new Error('You need to pass an object of the form {fn: Function}');
  }

  const fn = options.fn;
  const optionalValidator = getValidator(options.optionalValidator, defaultOptionalValidator);
  const allowsOptions = options.allowsOptions !== false;
  const allowsCallback = options.allowsCallback !== false;

  const nArityFn = function() {
    const passedArgs = Array.prototype.slice.call(arguments);
    const validationLevel = getValidationLevel(this);

    const popCallback = allowsCallback && typeof passedArgs[passedArgs.length - 1] === 'function';

    const args = [];
    const callback = popCallback ? passedArgs.pop() : undefined;
    for (let i = 0; i < arity; i += 1) {
      args.push(copy(passedArgs.shift()));
    }
    const options = optionalValidator(passedArgs.shift() || {});

    if (allowsOptions) {
      args.push(optionalValidator(options, validationLevel));
    }

    if (allowsCallback) {
      args.push(callback);
    }

    return fn.apply(this, args);
  };

  nArityFn._arity = arity;
  return nArityFn;
}

// TODO: Do we need arity two? Seems like it would be a bad idea in general.
module.exports = ['zero', 'one', 'two'].reduce((memo, label, idx) => {
  memo[label] = (impl, validator) => makeNArityFn(idx, impl, validator);
  return memo;
}, {});

module.exports.skip = options => options.fn;
