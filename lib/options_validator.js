'use strict';

const isObject = require('./utils').isObject;

let validationLevel = 'warn';

function createOptionsSchema(optionsSchema) {
  return validationFunction.bind(optionsSchema);
}

function validationFunction(providedOptions) {
  let validatedOptions = Object.assign({}, providedOptions);

  Object.keys(validatedOptions).forEach(option => {
    let optionValue = validatedOptions[option];
    let optionType = this[option].type;

    let invalidateMessage = `${option} should be of type ${optionType}, but is of type ${typeof optionValue}.`;

    if (typeof optionType === 'string') {
      if (optionType === 'object') {
        if (!isObject(optionValue)) {
          invalidate(validationLevel, invalidateMessage);
        }
      }
      if (typeof optionValue !== optionType) {
        invalidate(validationLevel, invalidateMessage);
      }
    } else if (Array.isArray(optionType)) {
      if (optionType.indexOf(typeof optionValue) === -1) {
        invalidate(validationLevel, invalidateMessage);
      }
    } else {
      if (!(optionValue instanceof optionType)) {
        invalidate(validationLevel, invalidateMessage);
      }
    }
  });
  return Object.freeze(validatedOptions);
}

function invalidate(validationLevel, message) {
  if (validationLevel === 'warn') {
    console.warn(message);
  } else if (validationLevel === 'error') {
    throw new Error(message);
  }
}

function setValidationLevel(providedValidationLevel) {
  validationLevel = providedValidationLevel;
}

module.exports = { createOptionsSchema, setValidationLevel };
