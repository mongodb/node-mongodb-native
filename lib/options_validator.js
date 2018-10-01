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
function validate(optionsSchema, providedOptions, overrideOptions, validationOptions) {
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

/**
 * This is a class to build an operation by checking its arity and validating its options.
 */
class OperationBuilder {
  constructor() {
    this.requiredArity = -1;
    this.validationSchema = {};
    this.overrideOptions = {};
  }

  /**
   * Set an operation's required arity.
   *
   * @method
   * @param {number} requiredArity The operation to validate.
   * @return {OperationBuilder} An operation builder with a set requiredArity.
   */
  arity(requiredArity) {
    this.requiredArity = requiredArity;
    return this;
  }

  /**
   * Set an OperationBuilder's validationSchema.
   *
   * @method
   * @param {object} validationSchema The schema against which to validate options.
   * @return {OperationBuilder} An operation builder that will validate options.
   */
  options(validationSchema) {
    this.validationSchema = validationSchema;
    return this;
  }

  overrides(overrideOptions) {
    this.overrideOptions = overrideOptions;
    return this;
  }

  /**
   * Build an operation by checking its arity and validating its options.
   *
   * @method
   * @param {function} operationToBuild The operation to validate.
   * @return {function} The operation with validated options.
   */
  build(operationToBuild) {
    const operationBuilder = this;

    function buildOperation() {
      assertArity(arguments, operationBuilder.requiredArity);

      const args = Array.prototype.slice.call(arguments);

      let validationOptions = { validationLevel: VALIDATION_LEVEL_WARN };
      if (this.s.options.validationLevel) {
        validationOptions = { validationLevel: this.s.options.validationLevel };
      }

      // validate options
      const optionsIndex =
        typeof args[args.length - 1] === 'function' ? args.length - 2 : args.length - 1;

      const verifiedOptions = validate(
        operationBuilder.validationSchema,
        args[optionsIndex],
        operationBuilder.overrideOptions,
        validationOptions
      );

      args[optionsIndex] = verifiedOptions;

      // call original function with validated options
      return operationToBuild.apply(this, args);
    }

    return buildOperation;
  }
}

/**
 * Build an OperationBuilder with a required arity of zero.
 *
 * @method
 * @param {number} requiredArity The required arity of the operation to build.
 * @return {OperationBuilder} An operation builder that will validate options.
 */
function arityZero() {
  const operationBuilder = new OperationBuilder(0);
  return operationBuilder.arity(0);
}

/**
 * Build an OperationBuilder with a required arity of one.
 *
 * @method
 * @param {number} requiredArity The required arity of the operation to build.
 * @return {OperationBuilder} An operation builder that will validate options.
 */
function arityOne() {
  const operationBuilder = new OperationBuilder(1);
  return operationBuilder.arity(1);
}

/**
 * Build an OperationBuilder with a required arity of two.
 *
 * @method
 * @param {number} requiredArity The required arity of the operation to build.
 * @return {OperationBuilder} An operation builder that will validate options.
 */
function arityTwo() {
  const operationBuilder = new OperationBuilder(2);
  return operationBuilder.arity(2);
}

module.exports = { arityZero, arityOne, arityTwo, assertArity, validate };
