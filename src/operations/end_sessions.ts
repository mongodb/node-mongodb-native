import {
  type ClientSession,
  type Connection,
  type ServerCommandOptions,
  type ServerSessionId,
  type TimeoutContext
} from '..';
import { type Document } from '../bson';
import { MongoDBResponse } from '../cmap/wire_protocol/responses';
import { ReadPreference } from '../read_preference';
import { MongoDBNamespace } from '../utils';
import { AbstractOperation } from './operation';

export class EndSessionsOperation extends AbstractOperation<void> {
  override ns = MongoDBNamespace.fromString('admin.$cmd');
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  private sessions: Array<ServerSessionId>;

  constructor(sessions: Array<ServerSessionId>) {
    super();
    this.sessions = sessions;
  }

  override buildCommand(_connection: Connection, _session?: ClientSession): Document {
    return {
      endSessions: this.sessions
    };
  }

  override buildOptions(timeoutContext: TimeoutContext): ServerCommandOptions {
    return {
      timeoutContext,
      readPreference: ReadPreference.primaryPreferred,
      noResponse: true
    };
  }

  override get commandName(): string {
    return 'endSessions';
  }
}
