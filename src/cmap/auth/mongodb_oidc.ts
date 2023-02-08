/** @internal */
export interface OIDCMechanismServerStep1 {
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizeEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  requestScopes?: string[];
}

/** @internal */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/** @internal */
export type OIDCRequestFunction = (
  idl: OIDCMechanismServerStep1
) => Promise<OIDCRequestTokenResult>;

/** @internal */
export type OIDCRefreshFunction = (
  idl: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult
) => Promise<OIDCRequestTokenResult>;
