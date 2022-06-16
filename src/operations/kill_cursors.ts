import type { Long } from '../bson';
import { MongoRuntimeError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback, MongoDBNamespace } from '../utils';
import { AbstractOperation, Aspect, defineAspects, OperationOptions } from './operation';

export class KillCursorsOperation extends AbstractOperation {
  cursorId: Long;
  constructor(cursorId: Long, ns: MongoDBNamespace, server: Server, options: OperationOptions) {
    super(options);
    this.ns = ns;
    this.cursorId = cursorId;
    this.server = server;
  }

  execute(server: Server, session: ClientSession | undefined, callback: Callback<void>): void {
    if (server !== this.server) {
      return callback(
        new MongoRuntimeError('Killcursor must run on the same server operation began on')
      );
    }
    server.killCursors(this.ns, [this.cursorId], { session }, () => callback());
  }
}

defineAspects(KillCursorsOperation, [Aspect.MUST_SELECT_SAME_SERVER]);
