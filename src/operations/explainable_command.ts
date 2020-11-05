import { CommandOperation, OperationParent, CommandOperationOptions } from './command';
import { Explain, Verbosity, VerbosityLike } from '../explain';
import { Callback, Document, MongoError, Server } from '..';

/** @public */
export interface ExplainOptions {
  explain?: VerbosityLike;
}

/** @internal */
export abstract class ExplainableCommand<
  T extends ExplainOptions & CommandOperationOptions,
  TResult = Document
> extends CommandOperation<T, TResult> {
  explain?: Explain;

  constructor(parent?: OperationParent, options?: T) {
    super(parent, options);

    if (!Explain.valid(options)) {
      throw new MongoError(`explain must be one of ${Object.keys(Verbosity)} or a boolean`);
    }

    this.explain = Explain.fromOptions(options);
  }

  get canRetryWrite(): boolean {
    return this.explain === undefined;
  }

  executeCommand(server: Server, cmd: Document, callback: Callback): void {
    if (this.explain) {
      if (!Explain.explainSupported(server, cmd)) {
        callback(new MongoError(`server ${server.name} does not support explain on this command`));
        return;
      }

      // For now, tag the command with the explain; after cmd is finalized in the super class,
      // it will be refactored into the required shape using the explain.
      cmd.explain = this.explain;
    }
    super.executeCommand(server, cmd, callback);
  }
}
