sys = require("sys");

var mongo = require('mongodb/bson/collections');
process.mixin(mongo, require('mongodb/collection'));
process.mixin(mongo, require('mongodb/cursor'));
process.mixin(mongo, require('mongodb/commands/db_command'));

exports.Admin = Class({
  init: function(db) {  
    this.db = db;
  },
  
  profilingLevel: function(callback) {
    var command = new mongo.OrderedHash();
    command.add('profile', -1);
    this.db.executeDbCommand(command, function(docs) {
      var doc = docs[0].documents[0];
      if(doc.ok == 1 || doc.was.constructor == Numeric) {
        var was = doc.was;
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
    var command = new mongo.OrderedHash();
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
      if(doc.ok == 1 || doc.was.constructor == Numeric) {
        callback(level);
      } else {
        callback(new Error("Error with profile command"));
      }    
    });
  },
  
  profilingInfo: function(callback) {
    new mongo.Cursor(this.db, new mongo.Collection(this.db, mongo.DbCommand.SYSTEM_PROFILE_COLLECTION), {}).toArray(function(items) {
      callback(items);
    });  
  },
  
  validatCollection: function(callback, collectionName) {
    var command = new mongo.OrderedHash();
    command.add('validate', collectionName);
    this.db.executeDbCommand(command, function(docs) {
      var doc = docs[0].documents[0];

      if(doc.ok == 0) {
        callback(new Error("Error with validate command"));
      } else if(doc.result.constructor != String) {
        callback(new Error("Error with validation data"));
      } else if(doc.result.match(/exception|corrupt/) != null) {
        callback(new Error("Error: invalid collection " + collectionName));
      } else {
        callback(doc);
      }
    });
  }  
})