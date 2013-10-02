// ***************************************************
// Write concerns
// ***************************************************
var _hasWriteConcern = function(errorOptions) {
  return errorOptions == true
    || errorOptions.w > 0
    || errorOptions.w == 'majority'
    || errorOptions.j == true
    || errorOptions.journal == true
    || errorOptions.fsync == true
}

var _setWriteConcernHash = function(options) {
  var finalOptions = {};
  if(options.w != null) finalOptions.w = options.w;  
  if(options.journal == true) finalOptions.j = options.journal;
  if(options.j == true) finalOptions.j = options.j;
  if(options.fsync == true) finalOptions.fsync = options.fsync;
  if(options.wtimeout != null) finalOptions.wtimeout = options.wtimeout;  
  return finalOptions;
}

var _getWriteConcern = function(self, options) {
  // Final options
  var finalOptions = {w:1};
  // Local options verification
  if(options.w != null || typeof options.j == 'boolean' || typeof options.journal == 'boolean' || typeof options.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(options);
  } else if(typeof options.safe == "boolean") {
    finalOptions = {w: (options.safe ? 1 : 0)};
  } else if(options.safe != null && typeof options.safe == 'object') {
    finalOptions = _setWriteConcernHash(options.safe);
  } else if(self.opts.w != null || typeof self.opts.j == 'boolean' || typeof self.opts.journal == 'boolean' || typeof self.opts.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(self.opts);
  } else if(typeof self.opts.safe == "boolean") {
    finalOptions = {w: (self.opts.safe ? 1 : 0)};
  } else if(self.db.safe.w != null || typeof self.db.safe.j == 'boolean' || typeof self.db.safe.journal == 'boolean' || typeof self.db.safe.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(self.db.safe);
  } else if(self.db.options.w != null || typeof self.db.options.j == 'boolean' || typeof self.db.options.journal == 'boolean' || typeof self.db.options.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(self.db.options);
  } else if(typeof self.db.safe == "boolean") {
    finalOptions = {w: (self.db.safe ? 1 : 0)};
  }

  // Ensure we don't have an invalid combination of write concerns
  if(finalOptions.w < 1 
    && (finalOptions.journal == true || finalOptions.j == true || finalOptions.fsync == true)) throw new Error("No acknowlegement using w < 1 cannot be combined with journal:true or fsync:true");

  // Return the options
  return finalOptions;
}

var _getReadConcern = function(self, options) {
  if(options.readPreference) return options.readPreference;
  if(self.readPreference) return self.readPreference;
  if(self.db.readPreference) return self.readPreference;
  return 'primary';
}

/**
 * @ignore
 */
var checkCollectionName = function checkCollectionName (collectionName) {
  if('string' !== typeof collectionName) {
    throw Error("collection name must be a String");
  }

  if(!collectionName || collectionName.indexOf('..') != -1) {
    throw Error("collection names cannot be empty");
  }

  if(collectionName.indexOf('$') != -1 &&
      collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null) {
    throw Error("collection names must not contain '$'");
  }

  if(collectionName.match(/^\.|\.$/) != null) {
    throw Error("collection names must not start or end with '.'");
  }

  // Validate that we are not passing 0x00 in the colletion name
  if(!!~collectionName.indexOf("\x00")) {
    throw new Error("collection names cannot contain a null character");
  }
};


/**
 * Normalizes a `hint` argument.
 *
 * @param {String|Object|Array} hint
 * @return {Object}
 * @api private
 */
var normalizeHintField = function normalizeHintField(hint) {
  var finalHint = null;

  if(typeof hint == 'string') {
    finalHint = hint;
  } else if(Array.isArray(hint)) {
    finalHint = {};

    hint.forEach(function(param) {
      finalHint[param] = 1;
    });  
  } else if(hint != null && typeof hint == 'object') {
    finalHint = {};
    for (var name in hint) {
      finalHint[name] = hint[name];
    }    
  }

  return finalHint;
};

exports._getWriteConcern = _getWriteConcern;
exports._hasWriteConcern = _hasWriteConcern;
exports._getReadConcern = _getReadConcern;
exports.checkCollectionName = checkCollectionName;
exports.normalizeHintField = normalizeHintField;