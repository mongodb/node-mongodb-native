import type { Long } from '../bson';
import { MongoRuntimeError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { MongoDBNamespace } from '../utils';
import { AbstractOperation, Aspect, defineAspects, type OperationOptions } from './operation';

/**
 * https://www.mongodb.com/docs/manual/reference/command/killCursors/
 * @internal
 */
interface KillCursorsCommand {
  killCursors: string;
  cursors: Long[];
  comment?: unknown;
}

export class KillCursorsOperation extends AbstractOperation {
  cursorId: Long;

  constructor(cursorId: Long, ns: MongoDBNamespace, server: Server, options: OperationOptions) {
    super(options);
    this.ns = ns;
    this.cursorId = cursorId;
    this.server = server;
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<void> {
    if (server !== this.server) {
      throw new MongoRuntimeError('Killcursor must run on the same server operation began on');
    }

    const killCursors = this.ns.collection;
    if (killCursors == null) {
      // Cursors should have adopted the namespace returned by MongoDB
      // which should always defined a collection name (even a pseudo one, ex. db.aggregate())
      throw new MongoRuntimeError('A collection name must be determined before killCursors');
    }

    const killCursorsCommand: KillCursorsCommand = {
      killCursors,
      cursors: [this.cursorId]
    };
    try {
      await server.commandAsync(this.ns, killCursorsCommand, { session });
    } catch {
      // The driver should never emit errors from killCursors, this is spec-ed behavior
    }
  }
}

defineAspects(KillCursorsOperation, [Aspect.MUST_SELECT_SAME_SERVER]);
