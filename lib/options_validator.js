'use strict';

const isObject = require('./utils').isObject;

const VALIDATION_LEVEL_NONE = 'none';
const VALIDATION_LEVEL_WARN = 'warn';
const VALIDATION_LEVEL_ERROR = 'error';

function createValidationFunction(optionsSchema, validationOptions) {
  return providedOptions => validationFunction(optionsSchema, providedOptions, validationOptions);
}

function validationFunction(optionsSchema, providedOptions, validationOptions) {
  let validationLevel = VALIDATION_LEVEL_WARN;
  let logger;
  if (validationOptions) {
    if (validationOptions.validationLevel) {
      validationLevel = validationOptions.validationLevel;
    }
    if (validationOptions.logger) {
      logger = validatedOptions.logger;
    }
  }

  const validatedOptions = Object.assign({}, providedOptions);

  if (validationLevel === VALIDATION_LEVEL_NONE) {
    return Object.freeze(validatedOptions);
  }

  Object.keys(validatedOptions).forEach(optionName => {
    if (optionsSchema[optionName] && optionsSchema[optionName].type != null) {
      const optionType = optionsSchema[optionName].type;
      const optionValue = validatedOptions[optionName];
      const invalidateMessage = `${optionName} should be of type ${optionType}, but is of type ${typeof optionValue}.`;

      if (typeof optionType === 'string') {
        if (
          (optionType === 'object' && !isObject(optionValue)) ||
          typeof optionValue !== optionType
        ) {
          invalidate(validationLevel, invalidateMessage, logger);
        }
      } else if (Array.isArray(optionType)) {
        if (optionType.indexOf(typeof optionValue) === -1) {
          invalidate(validationLevel, invalidateMessage, logger);
        }
      } else {
        if (!(optionValue instanceof optionType)) {
          invalidate(validationLevel, invalidateMessage, logger);
        }
      }
    }
  });

  return Object.freeze(validatedOptions);
}

function invalidate(validationLevel, message, logger) {
  if (logger) {
    if (validationLevel === VALIDATION_LEVEL_WARN) {
      logger.warn(message);
    } else if (validationLevel === VALIDATION_LEVEL_ERROR) {
      logger.error(message);
    }
  } else {
    if (validationLevel === VALIDATION_LEVEL_WARN) {
      console.warn(message);
    } else if (validationLevel === VALIDATION_LEVEL_ERROR) {
      throw new Error(message);
    }
  }
}

module.exports = { createValidationFunction };
