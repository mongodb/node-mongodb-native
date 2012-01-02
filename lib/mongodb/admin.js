var Collection = require('./collection').Collection,
    Cursor = require('./cursor').Cursor,
    DbCommand = require('./commands/db_command').DbCommand,
    debug = require('util').debug, 
    inspect = require('util').inspect;

var Admin = exports.Admin = function(db) {  
  this.db = db;
};

Admin.prototype.serverInfo = function(callback) {
  var self = this;
  var command = {buildinfo:1};
  this.command(command, function(err, doc) {
    if(err != null) return callback(err, null);
    return callback(null, doc.documents[0]);
  });
}

Admin.prototype.profilingLevel = function(callback) {
  var self = this;
  var command = {profile:-1};

  this.command(command, function(err, doc) {
    doc = doc.documents[0];
    
    if(err == null && (doc.ok == 1 || typeof doc.was === 'number')) {
      var was = doc.was;
      if(was == 0) {
        callback(null, "off");
      } else if(was == 1) {
        callback(null, "slow_only");
      } else if(was == 2) {
        callback(null, "all");
      } else {
        callback(new Error("Error: illegal profiling level value " + was), null);
      }
    } else {
      err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
    }
  });
};

Admin.prototype.ping = function(options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  // Set self
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.executeDbCommand({ping:1}, options, function(err, result) {
    self.db.databaseName = databaseName;
    return callback(err, result);
  })  
}

Admin.prototype.authenticate = function(username, password, callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.authenticate(username, password, function(err, result) {    
    self.db.databaseName = databaseName;
    return callback(err, result);
  })
}

Admin.prototype.logout = function(options, callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.logout(options, function(err, result) {
    return callback(err, result);
  })  

  self.db.databaseName = databaseName;
}

Admin.prototype.addUser = function(username, password, callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.addUser(username, password, function(err, result) {
    self.db.databaseName = databaseName;
    return callback(err, result);
  })  
}

Admin.prototype.setProfilingLevel = function(level, callback) {
  var self = this;
  var command = {};
  var profile = 0;

  if(level == "off") {
    profile = 0;
  } else if(level == "slow_only") {
    profile = 1;
  } else if(level == "all") {
    profile = 2;
  } else {
    return callback(new Error("Error: illegal profiling level value " + level));
  }

  // Set up the profile number
  command['profile'] = profile;  
  // Execute the command to set the profiling level
  this.command(command, function(err, doc) {
    doc = doc.documents[0];
    
    if(err == null && (doc.ok == 1 || typeof doc.was === 'number')) {
      return callback(null, level);
    } else {
      return err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
    }    
  });
};

Admin.prototype.profilingInfo = function(callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';

  try {
    new Cursor(this.db, new Collection(this.db, DbCommand.SYSTEM_PROFILE_COLLECTION), {}).toArray(function(err, items) {
      return callback(err, items);
    });    
  } catch (err) {
    return callback(err, null);
  }

  self.db.databaseName = databaseName;
};

Admin.prototype.command = function(command, callback) {
  var self = this;

  // Execute a command
  this.db.executeDbAdminCommand(command, function(err, result) {    
    // Ensure change before event loop executes
    return callback != null ? callback(err, result) : null;
  });
}

Admin.prototype.validateCollection = function(collectionName, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  var self = this;
  var command = {validate: collectionName};
  var keys = Object.keys(options);
  
  // Decorate command with extra options
  for(var i = 0; i < keys.length; i++) {
    if(options.hasOwnProperty(keys[i])) {
      command[keys[i]] = options[keys[i]];
    }
  }

  this.db.executeDbCommand(command, function(err, doc) {
    if(err != null) return callback(err, null);    
    doc = doc.documents[0];
    
    if(doc.ok == 0) {
      return callback(new Error("Error with validate command"), null);
    } else if(doc.result != null && doc.result.constructor != String) {
      return callback(new Error("Error with validation data"), null);
    } else if(doc.result != null && doc.result.match(/exception|corrupt/) != null) {
      return callback(new Error("Error: invalid collection " + collectionName), null);
    } else if(doc.valid != null && !doc.valid) {
      return callback(new Error("Error: invalid collection " + collectionName), null);      
    } else {
      return callback(null, doc);
    }
  });
};
