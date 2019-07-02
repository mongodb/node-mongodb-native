'use strict';

/**
 * Base class for environments in projects that use the test
 * runner
 */
class EnvironmentBase {
  /**
   * The default implementation of the environment setup
   *
   * @param {*} callback
   */
  setup(callback) {
    callback();
  }
}

module.exports = EnvironmentBase;
