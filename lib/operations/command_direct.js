'use strict';

const CommandOperationV2 = require('./command_v2');
const defineAspects = require('./operation').defineAspects;
const Aspect = require('./operation').Aspect;

class RunCommand extends CommandOperationV2 {
  constructor(parent, command, options) {
    super(parent, options);
    this.command = command;
  }
  execute(server, callback) {
    const command = this.command;
    this.executeCommand(server, command, callback);
  }
}
defineAspects(RunCommand, [Aspect.EXECUTE_WITH_SELECTION, Aspect.NO_INHERIT_OPTIONS]);

module.exports = RunCommand;
