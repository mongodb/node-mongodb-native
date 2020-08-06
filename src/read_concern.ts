export enum ReadConcernLevel {
  local = 'local',
  majority = 'majority',
  linearizable = 'linearizable',
  available = 'available',
  snapshot = 'snapshot'
}

/**
 * The **ReadConcern** class is a class that represents a MongoDB ReadConcern.
 *
 * @class
 * @property {string} level The read concern level
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html
 */
export class ReadConcern {
  level?: ReadConcernLevel;

  /**
   * Constructs a ReadConcern from the read concern properties.
   *
   * @param {string} [level] The read concern level ({'local'|'available'|'majority'|'linearizable'|'snapshot'})
   */
  constructor(level?: ReadConcernLevel) {
    this.level = level;
  }

  /**
   * Construct a ReadConcern given an options object.
   *
   * @param {any} options The options object from which to extract the write concern.
   * @returns {ReadConcern|undefined}
   */
  static fromOptions(options: any): ReadConcern | undefined {
    if (options == null) {
      return;
    }

    if (options.readConcern) {
      if (options.readConcern instanceof ReadConcern) {
        return options.readConcern;
      }

      return new ReadConcern(options.readConcern.level);
    }

    if (options.level) {
      return new ReadConcern(options.level);
    }
  }

  static get MAJORITY() {
    return ReadConcernLevel.majority;
  }

  static get AVAILABLE() {
    return ReadConcernLevel.available;
  }

  static get LINEARIZABLE() {
    return ReadConcernLevel.linearizable;
  }

  static get SNAPSHOT() {
    return ReadConcernLevel.snapshot;
  }
}
