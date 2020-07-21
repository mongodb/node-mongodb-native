import CommandOperation = require('./command');
import { Code } from '../bson';
import ReadPreference = require('../read_preference');
import { handleCallback } from '../utils';
import { MongoError } from '../error';

class EvalOperation extends CommandOperation {
  code: any;
  parameters: any;

  get readPreference() {
    // force primary read preference
    return ReadPreference.primary;
  }

  constructor(db: any, code: any, parameters: any, options?: any) {
    super(db, options);

    this.code = code;
    this.parameters = parameters;
  }

  execute(server: any, callback: Function) {
    let finalCode = this.code;
    let finalParameters = [];

    // If not a code object translate to one
    if (!(finalCode && finalCode._bsontype === 'Code')) {
      finalCode = new Code(finalCode);
    }

    // Ensure the parameters are correct
    if (this.parameters != null && typeof this.parameters !== 'function') {
      finalParameters = Array.isArray(this.parameters) ? this.parameters : [this.parameters];
    }

    // Create execution selector
    let cmd: any = { $eval: finalCode, args: finalParameters };

    // Check if the nolock parameter is passed in
    if (this.options.nolock) {
      cmd.nolock = this.options.nolock;
    }

    // Execute the command
    super.executeCommand(server, cmd, (err?: any, result?: any) => {
      if (err) return handleCallback(callback!, err, null);
      if (result && result.ok === 1) return handleCallback(callback!, null, result.retval);
      if (result)
        return handleCallback(
          callback!,
          MongoError.create({ message: `eval failed: ${result.errmsg}`, driver: true }),
          null
        );
      handleCallback(callback!, err, result);
    });
  }
}

export = EvalOperation;
