/*
  Hash Definition
*/

// Define constructor
Hash = function(arguments) {
  for(var argument in arguments) {
    var value = arguments[argument];
    this[argument] = value;
  }
}

Hash.prototype = new Object()

// Functions to add values
Hash.prototype.add = function(key, value) {
  this[key] = value;
  return this;
}

Hash.prototype.remove = function(key) {
  delete this[key];
  return this;
}

// Fetch the keys for the hash
Hash.prototype.keys = function() {
  var rv = [];
  for(var n in this) {
    if( this.hasOwnProperty(n) ) {
      rv.push(n);  ;      
    }      
  }
  return rv;        
}

Hash.prototype.values = function() {
  var rv = [];
  for(var n in this) {
    if(this.hasOwnProperty(n)) {
      rv.push(this[n]);      
    }    
  }
  return rv;  
}

Hash.prototype.length = function(){
 return this.keys().length;
}

/*
  Ordered Hash Definition
*/
OrderedHash = function(arguments) {
  this.ordered_keys = [];
  var index = 0;
  
  for(var argument in arguments) {
    var value = arguments[argument];
    this[argument] = value;
    this.ordered_keys[index++] = argument;
  }
}

OrderedHash.prototype = new Object()

// Functions to add values
OrderedHash.prototype.add = function(key, value) {
  if(this[key] == null) {
    this.ordered_keys[this.ordered_keys.length] = key;
  }

  this[key] = value;
  return this;
}

OrderedHash.prototype.remove = function(key) {
  var new_ordered_keys = [];
  // Remove all non_needed keys
  for(var i = 0; i < this.ordered_keys.length; i++) {
    if(!(this.ordered_keys[i] == key)) {
      new_ordered_keys[new_ordered_keys.length] = this.ordered_keys[i];
    }
  }
  // Assign the new arrays
  this.ordered_keys = new_ordered_keys;
  // Remove this reference to this
  delete this[key];
  return this;
}

OrderedHash.prototype.unordered_hash = function() {
  var hash = {};
  for(var i = 0; i < this.ordered_keys.length; i++) {
    hash[this.ordered_keys[i]] = this[this.ordered_keys[i]];
  }
  return hash;
}

// Fetch the keys for the hash
OrderedHash.prototype.keys = function() {
  return this.ordered_keys;        
}

OrderedHash.prototype.length = function(){
 return this.keys().length;
}

OrderedHash.prototype.toArray = function() {
  var array = {};
  var self = this;
  
  this.keys().forEach(function(key) {
    array[key] = self[key];
  });  
  return array;
}
