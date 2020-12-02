'use strict';

const MongoError = require('./core/error').MongoError;

const ExplainVerbosity = {
  queryPlanner: 'queryPlanner',
  queryPlannerExtended: 'queryPlannerExtended',
  executionStats: 'executionStats',
  allPlansExecution: 'allPlansExecution'
};

/**
 * @class
 * @property {'queryPlanner'|'queryPlannerExtended'|'executionStats'|'allPlansExecution'} verbosity The verbosity mode for the explain output.
 */
class Explain {
  /**
   * Constructs an Explain from the explain verbosity.
   *
   * For backwards compatibility, true is interpreted as "allPlansExecution"
   * and false as "queryPlanner". Prior to server version 3.6, aggregate()
   * ignores the verbosity parameter and executes in "queryPlanner".
   *
   * @param {'queryPlanner'|'queryPlannerExtended'|'executionStats'|'allPlansExecution'|boolean} [verbosity] The verbosity mode for the explain output.
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
   * @param {'queryPlanner'|'queryPlannerExtended'|'executionStats'|'allPlansExecution'|boolean} [options.explain] The verbosity mode for the explain output
   * @return {Explain}
   */
  static fromOptions(options) {
    if (options == null || options.explain === undefined) {
      return;
    }

    const explain = options.explain;
    if (typeof explain === 'boolean' || explain in ExplainVerbosity) {
      return new Explain(options.explain);
    }

    throw new MongoError(`explain must be one of ${Object.keys(ExplainVerbosity)} or a boolean`);
  }
}

module.exports = { Explain };
