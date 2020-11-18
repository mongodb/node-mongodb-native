'use strict';

/**
 * @class
 * @property {string} verbosity The verbosity mode for the explain output
 */
class Explain {
  /**
   * Constructs an Explain from the explain verbosity.
   *
   * For backwards compatibility, true is interpreted as "allPlansExecution"
   * and false as "queryPlanner". Prior to server version 3.6, aggregate()
   * ignores the verbosity parameter and executes in "queryPlanner".
   *
   * @param {string|boolean} [verbosity] The verbosity mode for the explain output ({'queryPlanner'|'queryPlannerExtended'|'executionStats'|'allPlansExecution'|boolean})
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
   * @param {object} options The options object from which to extract the explain.
   * @return {Explain}
   */
  static fromOptions(options) {
    if (options == null || options.explain === undefined) {
      return;
    }

    return new Explain(options.explain);
  }
}

module.exports = Explain;
