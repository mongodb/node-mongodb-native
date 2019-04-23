'use strict';

/**
 * The **WriteConcern** class is a class that represents a MongoDB WriteConcern.
 * @class
 * @param {} w
 * @param {} wtimeout
 * @param {} j
 * @param {} fsync
 * @return {WriteConcern}
 */
class WriteConcern {
  static fromOptions(options) {
    if (
      options == null ||
      (options.w == null && options.wtimeout == null && options.j == null && options.fsync == null)
    ) {
      return null;
    }

    let writeConcern = {};

    if (options.w != null) {
      writeConcern.w = options.w;
    }
    if (options.wtimeout != null) {
      writeConcern.wtimeout = options.wtimeout;
    }
    if (options.j != null) {
      writeConcern.j = options.j;
    }
    if (options.fsync != null) {
      writeConcern.fsync = options.fsync;
    }

    return writeConcern;
  }
}

module.exports = WriteConcern;
