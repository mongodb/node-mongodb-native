const kWriteConcernKeys = new Set(['w', 'wtimeout', 'j', 'fsync']);

/**
 * The **WriteConcern** class is a class that represents a MongoDB WriteConcern.
 *
 * @class
 * @property {(number|string)} w The write concern
 * @property {number} wtimeout The write concern timeout
 * @property {boolean} j The journal write concern
 * @property {boolean} fsync The file sync write concern
 * @see https://docs.mongodb.com/manual/reference/write-concern/index.html
 */
export class WriteConcern {
  w?: any;
  wtimeout?: any;
  j?: any;
  fsync?: any;

  /**
   * Constructs a WriteConcern from the write concern properties.
   *
   * @param {(number|string)} [w] The write concern
   * @param {number} [wtimeout] The write concern timeout
   * @param {boolean} [j] The journal write concern
   * @param {boolean} [fsync] The file sync write concern
   */
  constructor(w?: any, wtimeout?: number, j?: boolean, fsync?: boolean) {
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
   * @param {any} options The options object from which to extract the write concern.
   * @returns {WriteConcern|undefined}
   */
  static fromOptions(options: any): WriteConcern | undefined {
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
      if (typeof options.writeConcern === 'string') {
        return new WriteConcern(options.writeConcern);
      }
      if (!Object.keys(options.writeConcern).some((key: any) => kWriteConcernKeys.has(key))) {
        return;
      }
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
