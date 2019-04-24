'use strict';

/**
 * The **ReadConcern** class is a class that represents a MongoDB ReadConcern.
 * @class
 * @property {string} level The read concern level
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html
 */
class ReadConcern {
  /**
   * Constructs a ReadConcern from the read concern properties.
   * @param {string} [level] The read concern level ({'local'|'available'|'majority'|'linearizable'|'snapshot'})
   */
  constructor(level) {
    if (level != null) {
      this.level = level;
    }
  }

  /**
   * Construct a ReadConcern given an options object.
   *
   * @param {object} options The options object from which to extract the write concern.
   * @return {ReadConcern}
   */
  static fromOptions(options) {
    if (options == null) {
      return;
    }

    if (options.readConcern) {
      return new ReadConcern(options.readConcern.level);
    }

    return new ReadConcern(options.level);
  }
}

module.exports = ReadConcern;
