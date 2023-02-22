import { type Document, BSON } from 'bson';

import { type Callback, ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import { OIDCAuthContextProvider } from './oidc_auth_context_provider';
import { AuthMechanism } from '../providers';
import type { Workflow } from './workflow';

/**
 * OIDC implementation of a callback based workflow.
 * @internal
 */
export class CallbackWorkflow implements Workflow {
  contextProvider: OIDCAuthContextProvider;

  /**
   * Instantiate the workflow
   */
  constructor() {
    this.contextProvider = new OIDCAuthContextProvider();
  }

  /**
   * Execute the workflow.
   */
  execute(connection: Connection, credentials: MongoCredentials, callback: Callback): void {
    connection.command(
      ns(credentials.source),
      stepOneCommandDocument(credentials),
      undefined,
      (error, stepOneResult) => {
        if (error) {
          return callback(error);
        }
        // TODO: Deal with the payload in the result.
        this.contextProvider.getContext(connection, credentials, stepOneResult, (error, result) => {
          if (error) {
            return callback(error);
          }

          connection.command(
            ns(credentials.source),
            stepTwoCommandDocument(result.tokenResult.accessToken),
            undefined,
            (error, stepTwoResult) => {

            }
          );
        });
      }
    );
  }
}

/**
 * Generate the saslStart command document.
 */
function stepOneCommandDocument(credentials: MongoCredentials): Document {
  const payload: Document = {};
  if (credentials.username) {
    payload.n = credentials.username;
  }
  return {
    saslStart: 1,
    autoAuthorize: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: BSON.serialize(payload)
  };
}

/**
 * Generate the saslContinue command document.
 */
function stepTwoCommandDocument(token: string): Document {
  return {
    saslContinue: 1,
    //conversationId: conversationId,
    payload: BSON.serialize({ jwt: token })
  };
}
