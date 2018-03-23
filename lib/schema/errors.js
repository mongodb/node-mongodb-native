'use strict';

class SchemaCompileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaCompileError';
  }
}

class SchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

module.exports = {
  SchemaCompileError,
  SchemaValidationError
};
