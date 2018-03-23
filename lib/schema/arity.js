'use strict';

const compile = require('./compile').compile;

function getValidator(validator, defaultValidator) {
  const t = typeof validator;

  if (t === 'function') {
    return validator;
  } else if (t === 'object' && t != null) {
    return compile(validator);
  }

  return defaultValidator;
}

const defaultRequiredValidator = arr =>
  arr.map(x => (typeof x !== 'object' ? x : Object.assign(Array.isArray(x) ? [] : {}, x)));
const defaultOptionalValidator = x => Object.assign({}, x);

function getValidationLevel(ctx) {
  let level = 'error';
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
  const requiredValidator = getValidator(options.requiredValidator, defaultRequiredValidator);
  const optionalValidator = getValidator(options.optionalValidator, defaultOptionalValidator);
  const allowsOptions = options.allowsOptions !== false;
  const allowsCallback = options.allowsCallback !== false;
  const allowsOptionsAndCallback = allowsOptions && allowsCallback;

  // Note: these calculations rely on the fact that js arithmetic will
  // convert boolean values to 1 or 0.
  const maxNumberOfArguments = arity + allowsOptions + allowsCallback;
  const optionsIndex = allowsOptions ? arity : -1;
  const callbackIndex = allowsCallback ? arity + allowsOptions : -1;

  return function() {
    const passedArgs = Array.prototype.slice.call(arguments);
    const validationLevel = getValidationLevel(this);

    if (passedArgs.length > maxNumberOfArguments) {
      // TODO: should this vary based on validation level?
      // TODO: do something?
    } else if (passedArgs.length < arity) {
      throw new Error(`Cannot invoke this functon without at least ${arity} arguments`);
      // TODO: do something?
    }

    const args = requiredValidator(passedArgs.slice(0, arity), validationLevel);
    let options = passedArgs[optionsIndex] || {};
    let callback = passedArgs[callbackIndex];

    if (
      allowsOptionsAndCallback &&
      typeof options === 'function' &&
      typeof callback !== 'function'
    ) {
      callback = options;
      options = {};
    }

    if (allowsOptions) {
      args.push(optionalValidator(options, validationLevel));
    }

    if (allowsCallback) {
      args.push(callback);
    }

    return fn.apply(this, args);
  };
}

// TODO: Do we need arity two? Seems like it would be a bad idea in general.
module.exports = ['zero', 'one', 'two'].reduce((memo, label, idx) => {
  memo[label] = (impl, validator) => makeNArityFn(idx, impl, validator);
  return memo;
}, {});

module.exports.skip = ({ fn }) => fn;
