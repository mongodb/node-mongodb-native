'use strict';

const { MongoRuntimeError } = require('mongodb');
const { callbackify } = require('util');

module.exports = Object.create(null);

module.exports.toLegacy = Symbol.for('@@mdb.callbacks.toLegacy');

/**
 * @param {any} target
 * @param {string} symbolName
 * @returns {symbol}
 */
module.exports.getSymbolFrom = (target, symbolName) => {
  const symbol = Object.getOwnPropertySymbols(target).find(
    s => s.toString() === `Symbol(${symbolName})`
  );

  if (symbol == null) {
    throw new MongoRuntimeError(`Did not find Symbol(${symbolName}) on ${target}`);
  }

  return symbol;
};

/**
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {(error?: Error, result?: T) => void} callback
 * @param {(res: T) => T} [conversion]
 * @returns
 */
module.exports.maybeCallback = (promise, callback, conversion) => {
  promise = conversion == null ? promise : promise.then(result => conversion(result));

  if (callback != null) {
    callbackify(() => promise)(callback);
    return;
  }

  return promise;
};
