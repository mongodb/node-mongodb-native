sys = require("sys");

exports.Admin = Class({
  init: function(db) {  
    this.db = db;
  },
  
  profilingLevel: function(callback) {
    var command = new OrderedHash();
    command.add('profile', -1);
    this.db.executeDbCommand(command, function(docs) {
      var doc = docs[0].documents[0];
      if(doc.get('ok') == 1 || doc.get('was').constructor == Numeric) {
        var was = doc.get('was');
        if(was == 0) {
          callback("off");
        } else if(was == 1) {
          callback("slow_only");
        } else if(was == 2) {
          callback("all");
        } else {
          callback(new Error("Error: illegal profiling level value " + was));
        }
      } else {
        callback(new Error("Error with profile command"));
      }
    });
  },
  
  setProfilingLevel: function(callback, level) {
    var command = new OrderedHash();
    var profile = 0;
    if(level == "off") {
      profile = 0;
    } else if(level == "slow_only") {
      profile = 1;
    } else if(level == "all") {
      profile = 2;
    } else {
      callback(new Error("Error: illegal profiling level value " + level));
      return;
    }
    command.add('profile', profile);

    this.db.executeDbCommand(command, function(docs) {
      var doc = docs[0].documents[0];
      if(doc.get('ok') == 1 || doc.get('was').constructor == Numeric) {
        callback(level);
      } else {
        callback(new Error("Error with profile command"));
      }    
    });
  },
  
  profilingInfo: function(callback) {
    new Cursor(this.db, new Collection(this.db, DbCommand.SYSTEM_PROFILE_COLLECTION), {}).toArray(function(items) {
      callback(items);
    });  
  },
  
  validatCollection: function(callback, collectionName) {
    var command = new OrderedHash();
    command.add('validate', collectionName);
    this.db.executeDbCommand(command, function(docs) {
      var doc = docs[0].documents[0];

      if(doc.get('ok') == 0) {
        callback(new Error("Error with validate command"));
      } else if(doc.get('result').constructor != String) {
        callback(new Error("Error with validation data"));
      } else if(doc.get('result').match(/exception|corrupt/) != null) {
        callback(new Error("Error: invalid collection " + collectionName));
      } else {
        callback(doc);
      }
    });
  }  
})