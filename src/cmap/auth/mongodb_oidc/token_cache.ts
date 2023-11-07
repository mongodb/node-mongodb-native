import { MongoDriverError } from '../../../error';
import type { IdPInfo, IdPServerResponse } from '../mongodb_oidc';

/** @internal */
export interface TokenEntry {
  idpServerResponse: IdPServerResponse;
  idpInfo?: IdPInfo;
}

/** @internal */
export class TokenCache {
  private entry?: TokenEntry;

  hasToken(): boolean {
    return !!this.entry;
  }

  get(): TokenEntry {
    if (!this.entry) {
      throw new MongoDriverError('Requested an OIDC token entry which is not in the cache.');
    }
    return this.entry;
  }

  put(result: TokenEntry) {
    this.entry = result;
  }

  remove() {
    this.entry = undefined;
  }
}
