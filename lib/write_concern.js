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
  constructor(w, wtimeout, j, fsync) {
    if (w != null) {
      this.w = w;
    }
    if (wtimeout != null) {
      this.wtimeout = wtimeout;
    }
    if (j != null) {
      this.j = j;
    }
    if (fsync != null) {
      this.fsync = fsync;
    }
  }

  isDefined() {
    return this.w != null || this.wtimeout != null || this.j != null || this.fsync != null;
  }
}

module.exports = WriteConcern;
