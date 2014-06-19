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

exports.shallowClone = shallowClone;
exports.getSingleProperty = getSingleProperty;