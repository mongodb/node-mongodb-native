import { type Document, BSON } from 'bson';

import { MongoInvalidArgumentError } from '../../../error';
import { type Callback, ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import { AuthMechanism } from '../providers';

const FIVE_MINUTES = 300000;

/**
 * OIDC implementation of a callback based workflow.
 * @internal
 */
export class CallbackWorkflow {
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
        // TODO: Handle request/refresh/caching here ?
        const requestCallback = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
        if (requestCallback) {
          requestCallback(credentials.username, stepOneResult, AbortSignal.timeout(FIVE_MINUTES))
            .then(requestResult => {
              connection.command(
                ns(credentials.source),
                stepTwoCommandDocument(requestResult.accessToken),
                undefined,
                (error, stepTwoResult) => {
                  if (error) {
                    return callback(error);
                  }
                  callback(undefined, stepTwoResult);
                }
              );
            })
            .catch(err => {
              return callback(err);
            });
        } else {
          callback(
            new MongoInvalidArgumentError(
              'Auth mechanism property REQUEST_TOKEN_CALLBACK is required.'
            )
          );
        }
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
    // conversationId ?
    payload: BSON.serialize({ jwt: token })
  };
}
