'use strict';

const isObject = require('./utils').isObject;
const emitDeprecationWarning = require('./utils').emitDeprecationWarning;

const VALIDATION_LEVEL_NONE = 'none';
const VALIDATION_LEVEL_WARN = 'warn';
const VALIDATION_LEVEL_ERROR = 'error';

/**
 * Checks that arguments provided to an operation match that operation's arity.
 * An error will be thrown if the operation is called with an incorrect number of arguments.
 *
 * @method
 * @param {object} args Arguments supplied to the operation that is calling assertArity.
 * @param {number} requiredArity The correct arity of the operation.
 */
function assertArity(args, requiredArity) {
  // acceptable values for arity are 0, 1, and 2
  if (requiredArity < 0 || requiredArity > 2) {
    throw new Error('The arity of an operation can only be 0, 1, or 2.');
  }

  // requiredArity is the minimum number of arguments allowed
  // requiredArity + 2 is the maximum number of arguments allowed if there are options and a callback
  // requiredArity + 1 i s the maximum number of arguments allowed if there is no callback
  if (
    args.length < requiredArity ||
    args.length > requiredArity + 2 ||
    (typeof args[args.length - 1] !== 'function' && args.length > requiredArity + 1)
  ) {
    const invalidateMessageArity = `This operation has a required arity of ${requiredArity}, but ${
      args.length
    } arguments were provided.`;
    invalidate(VALIDATION_LEVEL_ERROR, invalidateMessageArity);
  }
}

/**
 * Create a validation function given an options schema.
 *
 * @method
 * @param {object} optionsSchema A schema specifying possible options and their types, defaults,
 *   deprecation status, and whether or not they are required.
 * @return {function} returns a validation function
 */
function createValidationFunction(optionsSchema) {
  return (providedOptions, overrideOptions, validationOptions) =>
    validationFunction(optionsSchema, providedOptions, overrideOptions, validationOptions);
}

/**
 * Validate all options passed into an operation by checking type, applying defaults, and checking deprecation.
 *
 * @method
 * @param {object} optionsSchema A schema specifying possible options and their types, defaults,
 *   deprecation status, and whether or not they are required.
 * @param {object} providedOptions The options passed into the operation.
 * @param {object} [overrideOptions] The values for options that need to check inheritance, like readPreference.
 * @param {object} [validationOptions] Options for the validation itself.
 * @param {Logger} [validationOptions.logger] A logger instance to use if validation fails.
 * @param {string} [validationOptions.validationLevel] The level at which to validate the providedOptions ('none', 'warn', or 'error').
 * @return {object} returns a frozen object of validated options
 */
function validationFunction(optionsSchema, providedOptions, overrideOptions, validationOptions) {
  let validationLevel = VALIDATION_LEVEL_WARN;
  let logger;

  if (validationOptions == null) {
    validationOptions = overrideOptions;
    overrideOptions = null;
  }

  if (validationOptions) {
    if (validationOptions.validationLevel) {
      validationLevel = validationOptions.validationLevel;
    }
    if (validationOptions.logger) {
      logger = validationOptions.logger;
    }
  }

  const verifiedOptions = Object.assign({}, providedOptions);

  if (validationLevel === VALIDATION_LEVEL_NONE && overrideOptions == null) {
    return Object.freeze(verifiedOptions);
  }

  Object.keys(optionsSchema).forEach(optionName => {
    const optionFromSchema = optionsSchema[optionName];

    if (overrideOptions && overrideOptions[optionName] != null) {
      if (!verifiedOptions.hasOwnProperty(optionName)) {
        verifiedOptions[optionName] = overrideOptions[optionName];
      }
      if (optionFromSchema && optionFromSchema.default) {
        console.warn(
          `A default value and override value were provided for option [${optionName}]. The override value will be used.`
        );
      }
    }

    if (validationLevel !== VALIDATION_LEVEL_NONE) {
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
        emitDeprecationWarning(deprecationMessage);
      }
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
 * @param {Logger} [logger] A logger instance.
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

module.exports = { assertArity, createValidationFunction };
