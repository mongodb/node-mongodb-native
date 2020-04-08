'use strict';

// Server capabilities
class ServerCapabilities {
  /**
   * @param {object} ismaster IsMaster response from server
   */
  constructor(ismaster) {
    // Capabilities
    /** @private */
    this._aggregationCursor = false;
    /** @private */
    this._writeCommands = false;
    /** @private */
    this._textSearch = false;
    /** @private */
    this._authCommands = false;
    /** @private */
    this._listCollections = false;
    /** @private */
    this._listIndexes = false;
    /** @private */
    this._maxNumberOfDocsInBatch = ismaster.maxWriteBatchSize || 1000;
    /** @private */
    this._commandsTakeWriteConcern = false;
    /** @private */
    this._commandsTakeCollation = false;

    if (ismaster.minWireVersion >= 0) {
      this._textSearch = true;
    }

    if (ismaster.maxWireVersion >= 1) {
      this._aggregationCursor = true;
      this._authCommands = true;
    }

    if (ismaster.maxWireVersion >= 2) {
      this._writeCommands = true;
    }

    if (ismaster.maxWireVersion >= 3) {
      this._listCollections = true;
      this._listIndexes = true;
    }

    if (ismaster.maxWireVersion >= 5) {
      this._commandsTakeWriteConcern = true;
      this._commandsTakeCollation = true;
    }

    // If no min or max wire version set to 0
    if (ismaster.minWireVersion == null) {
      ismaster.minWireVersion = 0;
    }

    if (ismaster.maxWireVersion == null) {
      ismaster.maxWireVersion = 0;
    }

    /** @private */
    this._minWireVersion = ismaster.minWireVersion;
    /** @private */
    this._maxWireVersion = ismaster.maxWireVersion;
  }

  get hasAggregationCursor() {
    return this._aggregationCursor;
  }
  get hasWriteCommands() {
    return this._writeCommands;
  }
  get hasTextSearch() {
    return this._textSearch;
  }
  get hasAuthCommands() {
    return this._authCommands;
  }
  get hasListCollectionsCommand() {
    return this._listCollections;
  }
  get hasListIndexesCommand() {
    return this._listIndexes;
  }
  get commandsTakeWriteConcern() {
    return this._commandsTakeWriteConcern;
  }
  get commandsTakeCollation() {
    return this._commandsTakeCollation;
  }
  /** @returns {number} */
  get minWireVersion() {
    return this._minWireVersion;
  }
  /** @returns {number} */
  get maxWireVersion() {
    return this._maxWireVersion;
  }
  /** @returns {number} */
  get maxNumberOfDocsInBatch() {
    return this._maxNumberOfDocsInBatch;
  }
}

module.exports = { ServerCapabilities };
