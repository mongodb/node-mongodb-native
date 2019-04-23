'use strict';

/**
 * The **WriteConcern** class is a class that represents a MongoDB WriteConcern.
 * @class
 * @property {(number|string)} w The write concern
 * @property {number} wtimeout The write concern timeout
 * @property {boolean} j The journal write concern
 * @property {boolean} fsync The file sync write concern
 * @see https://docs.mongodb.com/manual/reference/write-concern/index.html
 */
class WriteConcern {
  /**
   * Constructs a WriteConcern from the write concern properties.
   * @param {(number|string)} [w] The write concern
   * @param {number} [wtimeout] The write concern timeout
   * @param {boolean} [j] The journal write concern
   * @param {boolean} [fsync] The file sync write concern
   */
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

  /**
   * Construct a WriteConcern given an options object.
   *
   * @param {object} options The options object from which to extract the write concern.
   * @return {WriteConcern}
   */
  static fromOptions(options) {
    if (
      options == null ||
      (options.writeConcern == null &&
        options.w == null &&
        options.wtimeout == null &&
        options.j == null &&
        options.fsync == null)
    ) {
      return;
    }

    if (options.writeConcern) {
      return new WriteConcern(
        options.writeConcern.w,
        options.writeConcern.wtimeout,
        options.writeConcern.j,
        options.writeConcern.fsync
      );
    }

    return new WriteConcern(options.w, options.wtimeout, options.j, options.fsync);
  }
}

module.exports = WriteConcern;
