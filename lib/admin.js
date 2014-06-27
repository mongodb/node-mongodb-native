var Admin = function(db) {
  if(!(this instanceof Admin)) return new Admin(db);
  var self = this;

  this.command = function(command, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    options = args.length ? args.shift() : {};

    // Execute a command
    db.executeDbAdminCommand(command, options, function(err, doc) {
      return callback != null ? callback(err, doc) : null;
    });
  } 

  this.buildInfo = function(callback) {
    this.serverInfo(callback);
  }

  this.serverInfo = function(callback) {
    db.executeDbAdminCommand({buildinfo:1}, function(err, doc) {
      if(err != null) return callback(err, null);
      return callback(null, doc);
    });
  }

  this.serverStatus = function(callback) {
    var self = this;

    db.executeDbAdminCommand({serverStatus: 1}, function(err, doc) {
      if(err == null && doc.ok === 1) {
        callback(null, doc);
      } else {
        if(err) return callback(err, false);
        return callback(utils.toError(doc), false);
      }
    });
  };

  this.profilingLevel = function(callback) {
    var self = this;

    db.executeDbAdminCommand({profile:-1}, function(err, doc) {
      doc = doc;

      if(err == null && doc.ok === 1) {
        var was = doc.was;
        if(was == 0) return callback(null, "off");
        if(was == 1) return callback(null, "slow_only");
        if(was == 2) return callback(null, "all");
          return callback(new Error("Error: illegal profiling level value " + was), null);
      } else {
        err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
      }
    });
  };

  this.ping = function(options, callback) {
    // Unpack calls
    var args = Array.prototype.slice.call(arguments, 0);
    db.executeDbAdminCommand({ping: 1}, args.pop());
  }

  this.authenticate = function(username, password, callback) {
    db.authenticate(username, password, {authdb: 'admin'}, function(err, doc) {
      return callback(err, doc);
    })
  }

  this.logout = function(callback) {
    db.logout({authdb: 'admin'},  function(err, doc) {
      return callback(err, doc);
    })
  }

  this.addUser = function(username, password, options, callback) {
    var args = Array.prototype.slice.call(arguments, 2);
    callback = args.pop();
    options = args.length ? args.shift() : {};
    // Set the db name to admin
    options.dbName = 'admin';
    // Add user
    db.addUser(username, password, options, function(err, doc) {
      return callback(err, doc);
    })
  }

  this.removeUser = function(username, options, callback) {
    var self = this;
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    options = args.length ? args.shift() : {};
    options.dbName = 'admin';

    db.removeUser(username, options, function(err, doc) {
      return callback(err, doc);
    })
  }

  this.setProfilingLevel = function(level, callback) {
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

    db.executeDbAdminCommand(command, function(err, doc) {
      doc = doc;

      if(err == null && doc.ok === 1)
        return callback(null, level);
      return err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
    });
  };

  this.profilingInfo = function(callback) {
    try {
      new Cursor(db, new Collection(db, DbCommand.SYSTEM_PROFILE_COLLECTION), {}, {}, {dbName: 'admin'}).toArray(function(err, items) {
          return callback(err, items);
      });
    } catch (err) {
      return callback(err, null);
    }
  };

  this.validateCollection = function(collectionName, options, callback) {
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

    db.command(command, function(err, doc) {
      if(err != null) return callback(err, null);

      if(doc.ok === 0)
        return callback(new Error("Error with validate command"), null);
      if(doc.result != null && doc.result.constructor != String)
        return callback(new Error("Error with validation data"), null);
      if(doc.result != null && doc.result.match(/exception|corrupt/) != null)
        return callback(new Error("Error: invalid collection " + collectionName), null);
      if(doc.valid != null && !doc.valid)
        return callback(new Error("Error: invalid collection " + collectionName), null);

      return callback(null, doc);
    });
  };

  this.listDatabases = function(callback) {
    // Execute the listAllDatabases command
    db.executeDbAdminCommand({listDatabases:1}, {}, function(err, doc) {
      if(err != null) return callback(err, null);
      return callback(null, doc);
    });
  }

  this.replSetGetStatus = function(callback) {
    var self = this;

    db.executeDbAdminCommand({replSetGetStatus:1}, function(err, doc) {
      if(err == null && doc.ok === 1)
        return callback(null, doc);
      if(err) return callback(err, false);
      return callback(utils.toError(doc), false);
    });
  };   
}

module.exports = Admin;