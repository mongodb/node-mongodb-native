import {
  type ClientSession,
  type Connection,
  type ServerCommandOptions,
  type ServerSessionId,
  type TimeoutContext,
  type WriteConcern
} from '..';
import { type Document } from '../bson';
import { MongoDBResponse } from '../cmap/wire_protocol/responses';
import { CommandOperation } from '../operations/command';
import { ReadPreference } from '../read_preference';
import { MongoDBNamespace } from '../utils';
import { Aspect } from './operation';

export class EndSessionsOperation extends CommandOperation<void> {
  static override aspects = new Set([Aspect.WRITE_OPERATION]);

  override writeConcern?: WriteConcern | undefined = { w: 0 };
  override ns = MongoDBNamespace.fromString('admin.$cmd');
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  private sessions: Array<ServerSessionId>;

  constructor(sessions: Array<ServerSessionId>) {
    super();
    this.sessions = sessions;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    return {
      endSessions: this.sessions
    };
  }
  override buildOptions(timeoutContext: TimeoutContext): ServerCommandOptions {
    return {
      timeoutContext,
      readPreference: ReadPreference.primaryPreferred
    };
  }
  override get commandName(): string {
    return 'endSessions';
  }
}
