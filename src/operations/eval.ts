import { CommandOperation, CommandOperationOptions } from './command';
import { Code, Document } from '../bson';
import { ReadPreference } from '../read_preference';
import { MongoError } from '../error';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

/** @public */
export interface EvalOptions extends CommandOperationOptions {
  nolock?: boolean;
}

/** @internal */
export class EvalOperation extends CommandOperation<EvalOptions, Document> {
  code: Code;
  parameters?: Document | Document[];

  constructor(db: Db, code: Code, parameters?: Document | Document[], options?: EvalOptions) {
    super(db, options);

    this.code = code;
    this.parameters = parameters;
    this.readPreference = ReadPreference.primary;
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
