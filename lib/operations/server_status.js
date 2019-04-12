'use strict';

const ExecuteDbAdminCommandOperation = require('./execute_db_admin_command');

class ServerStatusOperation extends ExecuteDbAdminCommandOperation {
  constructor(admin, options) {
    super(admin.s.db, { serverStatus: 1 }, options);
  }

  execute(callback) {
    super.execute(callback);
  }
}

module.exports = ServerStatusOperation;
