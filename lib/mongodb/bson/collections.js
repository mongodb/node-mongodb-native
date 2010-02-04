require('mongodb/lang/oo');
/*
  Ordered Hash Definition
*/
exports.OrderedHash = Class({
  init: function(arguments) {
    this.ordered_keys = [];
    this.values = {};
    var index = 0;

    for(var argument in arguments) {
      var value = arguments[argument];
      this.values[argument] = value;
      this.ordered_keys[index++] = argument;
    }
  },
  
  // Functions to add values
  add: function(key, value) {
    if(this.values[key] == null) {
      this.ordered_keys[this.ordered_keys.length] = key;
    }

    this.values[key] = value;
    return this;
  },
  
  remove: function(key) {
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
    delete this.values[key];
    return this;
  },
  
  unorderedHash: function() {
    var hash = {};
    for(var i = 0; i < this.ordered_keys.length; i++) {
      hash[this.ordered_keys[i]] = this.values[this.ordered_keys[i]];
    }
    return hash;
  },
  
  // Fetch the keys for the hash
  keys: function() {
    return this.ordered_keys;        
  },
  
  get: function(key) {
    return this.values[key];
  },
  
  length: function(){
   return this.keys().length;
  },
  
  toArray: function() {
    var array = {};
    var self = this;

    this.keys().forEach(function(key) {
      array[key] = self.values[key];
    });  
    return array;
  }
})