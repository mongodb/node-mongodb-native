import { CommandOperation, CommandOperationOptions } from './command';
import { Code } from '../bson';
import { ReadPreference } from '../read_preference';
import { MongoError } from '../error';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export interface EvalOptions extends CommandOperationOptions {
  nolock: boolean;
}

export class EvalOperation extends CommandOperation<EvalOptions> {
  code: Code;
  parameters?: Document | Document[];

  get readPreference(): ReadPreference {
    // force primary read preference
    return ReadPreference.primary;
  }

  constructor(db: Db, code: Code, parameters?: Document | Document[], options?: EvalOptions) {
    super(db, options);

    this.code = code;
    this.parameters = parameters;
  }

  execute(server: Server, callback: Callback<Document>): void {
    let finalCode = this.code;
    let finalParameters: Document[] = [];

    // If not a code object translate to one
    if (!(finalCode && ((finalCode as unknown) as { _bsontype: string })._bsontype === 'Code')) {
      finalCode = new Code(finalCode as never);
    }

    // Ensure the parameters are correct
    if (this.parameters != null && typeof this.parameters !== 'function') {
      finalParameters = Array.isArray(this.parameters) ? this.parameters : [this.parameters];
    }

    // Create execution selector
    const cmd: Document = { $eval: finalCode, args: finalParameters };

    // Check if the nolock parameter is passed in
    if (this.options.nolock) {
      cmd.nolock = this.options.nolock;
    }

    // Execute the command
    super.executeCommand(server, cmd, (err, result) => {
      if (err) return callback(err);
      if (result && result.ok === 1) {
        return callback(undefined, result.retval);
      }

      if (result) {
        callback(MongoError.create({ message: `eval failed: ${result.errmsg}`, driver: true }));
        return;
      }

      callback(err, result);
    });
  }
}
