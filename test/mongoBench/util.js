'use strict';

function asyncChain(_chain) {
  // Make a copy of the chain so people can't mutate it :)
  const chain = [].concat(_chain);
  chain.forEach(fn => {
    if (typeof fn !== 'function') {
      throw new TypeError(`${fn} is not a function`);
    }
  });
  return function() {
    const context = this;

    // Takes an array of async and/or sync functions, and executes them in order.
    return chain.reduce((resolved, fn) => resolved.then(() => fn.call(context)), Promise.resolve());
  };
}

function noop() {}

module.exports = { asyncChain, noop };
