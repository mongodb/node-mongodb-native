require("mongodb/bson/bson");
require("mongodb/bson/collections");

sys = require("sys");

Admin = function(db) {  
  this.db = db;
}

// Set basic prototype
Admin.prototype = new Object();

Admin.prototype.profilingLevel = function(callback) {
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
        callback({ok:false, err:true, errmsg:"Error: illegal profiling level value " + was});
      }
    } else {
      callback({ok:false, err:true, errmsg:"Error with profile command"});
    }
  });
}

Admin.prototype.setProfilingLevel = function(callback, level) {
  var command = new OrderedHash();
  var profile = 0;
  if(level == "off") {
    profile = 0;
  } else if(level == "slow_only") {
    profile = 1;
  } else if(level == "all") {
    profile = 2;
  } else {
    callback({ok:false, err:true, errmsg:"Error: illegal profiling level value " + level});    
    return;
  }
  command.add('profile', profile);
  
  this.db.executeDbCommand(command, function(docs) {
    var doc = docs[0].documents[0];
    if(doc.get('ok') == 1 || doc.get('was').constructor == Numeric) {
      callback(level);
    } else {
      callback({ok:false, err:true, errmsg:"Error with profile command"});
    }    
  });
}

Admin.prototype.profilingInfo = function(callback) {
  new Cursor(this.db, new Collection(this.db, DbCommand.SYSTEM_PROFILE_COLLECTION), {}).toArray(function(items) {
    callback(items);
  });  
}

Admin.prototype.validatCollection = function(callback, collectionName) {
  var command = new OrderedHash();
  command.add('validate', collectionName);
  this.db.executeDbCommand(command, function(docs) {
    var doc = docs[0].documents[0];
        
    if(doc.get('ok') == 0) {
      callback({ok:false, err:true, errmsg:"Error with validate command"});
    } else if(doc.get('result').constructor != String) {
      callback({ok:false, err:true, errmsg:"Error with validation data"});      
    } else if(doc.get('result').match(/exception|corrupt/) != null) {
      callback({ok:false, err:true, errmsg:"Error: invalid collection " + collectionName});            
    } else {
      callback(doc);
    }
  });
}












