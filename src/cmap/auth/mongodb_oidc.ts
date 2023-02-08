/**
 * TODO: NODE-5035: Make API public
 *
 * @internal */
export interface OIDCMechanismServerStep1 {
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizeEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  requestScopes?: string[];
}

/**
 * TODO: NODE-5035: Make API public
 *
 * @internal */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/**
 * TODO: NODE-5035: Make API public
 *
 * @internal */
export type OIDCRequestFunction = (
  idl: OIDCMechanismServerStep1
) => Promise<OIDCRequestTokenResult>;

/**
 * TODO: NODE-5035: Make API public
 *
 * @internal */
export type OIDCRefreshFunction = (
  idl: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult
) => Promise<OIDCRequestTokenResult>;
