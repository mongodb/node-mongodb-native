'use strict';

const isObject = require('./utils').isObject;

const VALIDATION_LEVEL_NONE = 'none';
const VALIDATION_LEVEL_WARN = 'warn';
const VALIDATION_LEVEL_ERROR = 'error';

/**
 * Create a validation function given an options schema.
 *
 * @method
 * @param {object} optionsSchema A schema specifying possible options and their types, defaults,
 *   deprecation status, and whether or not they are required.
 * @return {function} returns a validation function
 */
function createValidationFunction(optionsSchema) {
  return (providedOptions, validationOptions) =>
    validationFunction(optionsSchema, providedOptions, validationOptions);
}

/**
 * Validate all options passed into an operation by checking type, applying defaults, and checking deprecation.
 *
 * @method
 * @param {object} optionsSchema A schema specifying possible options and their types, defaults,
 *   deprecation status, and whether or not they are required.
 * @param {object} providedOptions The options passed into the operation.
 * @param {object} validationOptions Options for the validation itself.
 * @param {Logger} validationOptions.logger Optional. A logger instance to use if validation fails.
 * @param {string} validationOptions.validationLevel Optional. The level at which to validate the providedOptions ('none', 'warn', or 'error').
 * @return {object} returns a frozen object of validated options
 */
function validationFunction(optionsSchema, providedOptions, validationOptions) {
  let validationLevel = VALIDATION_LEVEL_WARN;
  let logger;
  if (validationOptions) {
    if (validationOptions.validationLevel) {
      validationLevel = validationOptions.validationLevel;
    }
    if (validationOptions.logger) {
      logger = validationOptions.logger;
    }
  }

  const verifiedOptions = Object.assign({}, providedOptions);

  if (validationLevel === VALIDATION_LEVEL_NONE) {
    return Object.freeze(verifiedOptions);
  }

  Object.keys(optionsSchema).forEach(optionName => {
    const optionFromSchema = optionsSchema[optionName];

    if (optionFromSchema.required && !verifiedOptions.hasOwnProperty(optionName)) {
      const invalidateMessageRequired = `required option [${optionName}] was not found.`;
      invalidate(validationLevel, invalidateMessageRequired, logger);
    }

    if (optionFromSchema.default && !verifiedOptions.hasOwnProperty(optionName)) {
      verifiedOptions[optionName] = optionFromSchema.default;
    }

    if (verifiedOptions[optionName] && optionFromSchema.type != null) {
      const optionType = optionFromSchema.type;
      const optionValue = verifiedOptions[optionName];
      const invalidateMessageType = `${optionName} should be of type ${optionType}, but is of type ${typeof optionValue}.`;

      if (typeof optionType === 'string') {
        if (
          (optionType === 'object' && !isObject(optionValue)) ||
          typeof optionValue !== optionType
        ) {
          invalidate(validationLevel, invalidateMessageType, logger);
        }
      } else if (Array.isArray(optionType)) {
        if (optionType.indexOf(typeof optionValue) === -1) {
          invalidate(validationLevel, invalidateMessageType, logger);
        }
      } else {
        if (!(optionValue instanceof optionType)) {
          invalidate(validationLevel, invalidateMessageType, logger);
        }
      }
    }

    if (optionFromSchema.deprecated && verifiedOptions.hasOwnProperty(optionName)) {
      const deprecationMessage = `option [${optionName}] is deprecated and will be removed in a later version.`;
      invalidate(VALIDATION_LEVEL_WARN, deprecationMessage, logger);
    }
  });

  return Object.freeze(verifiedOptions);
}

/**
 * Warn or error if an option fails validation.
 *
 * @method
 * @param {string} validationLevel The level at which to validate the providedOptions ('warn' or 'error').
 * @param {string} message The message to warn or error.
 * @param {Logger} logger Optional. A logger instance.
 */
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
