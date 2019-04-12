'use strict';

const ExecuteDbAdminCommandOperation = require('./execute_db_admin_command');

class ReplSetGetStatusOperation extends ExecuteDbAdminCommandOperation {
  constructor(admin, options) {
    super(admin.s.db, { replSetGetStatus: 1 }, options);
  }

  execute(callback) {
    super.execute(callback);
  }
}

module.exports = ReplSetGetStatusOperation;
