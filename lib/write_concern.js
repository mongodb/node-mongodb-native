'use strict';

const kWriteConcernKeys = new Set(['w', 'wtimeout', 'j', 'journal', 'fsync']);

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
   * @param {object} [options] The options object from which to extract the write concern.
   * @param {(number|string)} [options.w] **Deprecated** Use `options.writeConcern` instead
   * @param {number} [options.wtimeout] **Deprecated** Use `options.writeConcern` instead
   * @param {boolean} [options.j] **Deprecated** Use `options.writeConcern` instead
   * @param {boolean} [options.fsync] **Deprecated** Use `options.writeConcern` instead
   * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
   * @return {WriteConcern}
   */
  static fromOptions(options) {
    if (
      options == null ||
      (options.writeConcern == null &&
        options.w == null &&
        options.wtimeout == null &&
        options.j == null &&
        options.journal == null &&
        options.fsync == null)
    ) {
      return;
    }

    if (options.writeConcern) {
      if (typeof options.writeConcern === 'string') {
        return new WriteConcern(options.writeConcern);
      }

      if (!Object.keys(options.writeConcern).some(key => kWriteConcernKeys.has(key))) {
        return;
      }

      return new WriteConcern(
        options.writeConcern.w,
        options.writeConcern.wtimeout,
        options.writeConcern.j || options.writeConcern.journal,
        options.writeConcern.fsync
      );
    }

    console.warn(
      `Top-level use of w, wtimeout, j, and fsync is deprecated. Use writeConcern instead.`
    );
    return new WriteConcern(
      options.w,
      options.wtimeout,
      options.j || options.journal,
      options.fsync
    );
  }
}

module.exports = WriteConcern;
