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

  static fromLevel(level) {
    return new ReadConcern(level);
  }

  toJSON() {
    const json = {};
    if (this.level) json.level = this.level;
    return json;
  }

  static fromJSON(json) {
    if ('level' in json) {
      return new ReadConcern(json.level);
    }
    // NOTE: this does not throw / warn if extra properties are present in the object
    throw new TypeError(`Invalid ReadConcern JSON: ${JSON.stringify(json)}`);
  }

  static fromLike(like) {
    if (typeof like === 'string') return ReadConcern.fromLevel(like);
    if (typeof like === 'object' && like != null) return ReadConcern.fromJSON(like);
    throw new TypeError(`Invalid ReadConcern: ${JSON.stirngify(like)}`);
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
      const { readConcern } = options;
      if (readConcern instanceof ReadConcern) {
        return readConcern;
      } else if (typeof readConcern === 'string') {
        return new ReadConcern(readConcern);
      } else if ('level' in readConcern && readConcern.level) {
        return new ReadConcern(readConcern.level);
      }
    }

    if (options.level) {
      return new ReadConcern(options.level);
    }
  }

  static get MAJORITY() {
    return 'majority';
  }

  static get AVAILABLE() {
    return 'available';
  }

  static get LINEARIZABLE() {
    return 'linearizable';
  }

  static get SNAPSHOT() {
    return 'snapshot';
  }
}

module.exports = ReadConcern;
