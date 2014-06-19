var shallowClone = function(obj) {
  var copy = {};
  for(var name in obj) copy[name] = obj[name];
  return copy;
}

// Set simple property
var getSingleProperty = function(obj, name, value) {
  Object.defineProperty(obj, name, {
    enumerable:true,
    get: function() {
      return value 
    }
  });  
}

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

exports.shallowClone = shallowClone;
exports.getSingleProperty = getSingleProperty;
exports.checkCollectionName = checkCollectionName;