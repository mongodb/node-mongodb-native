'use strict';

function defineAspects(operation, aspects) {
  aspects = new Set(aspects);
  Object.defineProperty(operation, 'aspects', {
    value: aspects,
    writable: false
  });
  return aspects;
}

module.exports = {
  defineAspects
};
