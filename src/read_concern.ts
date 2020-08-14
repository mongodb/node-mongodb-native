export enum ReadConcernLevel {
  local = 'local',
  majority = 'majority',
  linearizable = 'linearizable',
  available = 'available',
  snapshot = 'snapshot'
}

/**
 * The MongoDB ReadConcern, which allows for control of the consistency and isolation properties
 * of the data read from replica sets and replica set shards.
 *
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html
 */
export class ReadConcern {
  level: ReadConcernLevel;

  /**
   * Constructs a ReadConcern from the read concern properties.
   *
   * @param level - The read concern level ({'local'|'available'|'majority'|'linearizable'|'snapshot'})
   */
  constructor(level: ReadConcernLevel) {
    this.level = level;
  }

  /**
   * Construct a ReadConcern given an options object.
   *
   * @param options - The options object from which to extract the write concern.
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

  static get MAJORITY(): string {
    return ReadConcernLevel.majority;
  }

  static get AVAILABLE(): string {
    return ReadConcernLevel.available;
  }

  static get LINEARIZABLE(): string {
    return ReadConcernLevel.linearizable;
  }

  static get SNAPSHOT(): string {
    return ReadConcernLevel.snapshot;
  }
}
