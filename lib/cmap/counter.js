'use strict';

function* makeCounter(seed) {
  let count = seed || 0;
  while (true) {
    const newCount = count;
    count += 1;
    yield newCount;
  }
}

module.exports = { makeCounter };
