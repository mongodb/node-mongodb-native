function MongoError(message) {
    this.name = 'MongoError';
    this.message = message;
    this.stack = (new Error()).stack;
}

// Add create function
MongoError.create = function(options) {
  var err = null;

  if(options instanceof Error) {
    err = new MongoError(options.message);
    err.stack = options.stack;
  } else if(typeof options == 'string') {
    err = new MongoError(options);
  } else {
    err = new MongoError(options);
    // Other options
    for(var name in options) {
      err[name] = options[name];
    }
  }

  return err;
}

// Extend JavaScript error
MongoError.prototype = new Error; 

module.exports = MongoError;