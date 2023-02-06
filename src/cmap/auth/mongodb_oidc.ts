/** @public */
export interface OIDCMechanismServerStep1 {
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizeEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  requestScopes?: string[];
}

/** @public */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/** @public */
export interface OIDCRequestFunction {
  (idl: OIDCMechanismServerStep1): Promise<OIDCRequestTokenResult>;
}

/** @public */
export interface OIDCRefreshFunction {
  (idl: OIDCMechanismServerStep1, result: OIDCRequestTokenResult): Promise<OIDCRequestTokenResult>;
}
