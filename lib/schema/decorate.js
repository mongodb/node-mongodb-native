'use strict';

function deprecate(validator, additionalMessage) {
  additionalMessage = additionalMessage || '';
  return (value, key) => {
    console.warn(`Option ${key} is deprecated. ${additionalMessage}`);
    return validator(value, key);
  };
}

module.exports = { deprecate };
