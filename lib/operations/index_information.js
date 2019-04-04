'use strict';

const OperationBase = require('./operation').OperationBase;
const indexInformation = require('./common_functions').indexInformation;

class IndexInformationOperation extends OperationBase {
  constructor(db, name, options) {
    super(options);

    this.db = db;
    this.name = name;
  }

  execute(callback) {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    indexInformation(db, name, options, callback);
  }
}

module.exports = IndexInformationOperation;
