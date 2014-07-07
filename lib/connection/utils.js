// Set property function
var setProperty = function(obj, prop, flag, values) {
  Object.defineProperty(obj, prop.name, {
      enumerable:true,
      set: function(value) {
        if(typeof value != 'boolean') throw new Error(f("%s required a boolean", prop.name));
        if(value) values.flags |= flag;
        if(!value) values.flags ^= flag;
        prop.value = value;
      }
    , get: function() { return prop.value; }
  });
}

// Set property function
var getProperty = function(obj, propName, fieldName, values, func) {
  Object.defineProperty(obj, propName, {
    enumerable:true,
    get: function() { 
      // Not parsed yet, parse it
      if(values[fieldName] == null && obj.isParsed && !obj.isParsed()) {
        obj.parse();
      }

      // Do we have a post processing function
      if(typeof func == 'function') return func(values[fieldName]);
      // Return raw value
      return values[fieldName];
    }
  });
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

// Shallow copy
var copy = function(fObj, tObj) {
  tObj = tObj || {};
  for(var name in fObj) tObj[name] = fObj[name];
  return tObj;
}

exports.setProperty = setProperty;
exports.getProperty = getProperty;
exports.getSingleProperty = getSingleProperty;
exports.copy = copy;