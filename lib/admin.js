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
}

module.exports = Admin;