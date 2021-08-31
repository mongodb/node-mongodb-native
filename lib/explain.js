'use strict';

const MongoError = require('./core/error').MongoError;

/**
 * @class
 * @property {string} verbosity The verbosity mode for the explain output, e.g.: 'queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution'.
 */
class Explain {
  /**
   * Constructs an Explain from the explain verbosity.
   *
   * For backwards compatibility, true is interpreted as "allPlansExecution"
   * and false as "queryPlanner". Prior to server version 3.6, aggregate()
   * ignores the verbosity parameter and executes in "queryPlanner".
   *
   * @param {string|boolean} [verbosity] The verbosity mode for the explain output.
   */
  constructor(verbosity) {
    if (typeof verbosity === 'boolean') {
      this.verbosity = verbosity ? 'allPlansExecution' : 'queryPlanner';
    } else {
      this.verbosity = verbosity;
    }
  }

  /**
   * Construct an Explain given an options object.
   *
   * @param {object} [options] The options object from which to extract the explain.
   * @param {string|boolean} [options.explain] The verbosity mode for the explain output.
   * @return {Explain}
   */
  static fromOptions(options) {
    if (options == null || options.explain === undefined) {
      return;
    }

    const explain = options.explain;
    if (typeof explain === 'boolean' || typeof explain === 'string') {
      return new Explain(options.explain);
    }

    throw new MongoError(`explain must be a string or a boolean`);
  }
}

module.exports = { Explain };
