const path = require('path');
const Module = require('module');
const loader = Module._load;

Module._load = function(request, loc) {
  if (request === 'mongodb') {
    arguments[0] = path.join(__dirname, '..', '..', 'lib');
  }
  return loader.apply(this, arguments);
};
