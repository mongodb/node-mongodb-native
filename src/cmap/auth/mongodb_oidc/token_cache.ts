import { MongoDriverError } from '../../../error';
import { type IdPServerResponse } from '../mongodb_oidc';

/** @internal */
export class TokenCache {
  private tokenResult?: IdPServerResponse;

  hasToken(): boolean {
    return !!this.tokenResult;
  }

  get(): IdPServerResponse {
    if (!this.tokenResult) {
      throw new MongoDriverError('no token');
    }
    return this.tokenResult;
  }

  put(result: IdPServerResponse) {
    this.tokenResult = result;
  }

  remove() {
    this.tokenResult = undefined;
  }
}
