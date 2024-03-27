import { AWSSDKCredentialProvider } from '../../cmap/auth/aws_temporary_credentials';
import { loadAzureCredentials } from './azure';
import { loadGCPCredentials } from './gcp';

/**
 * @public
 */
export type ClientEncryptionDataKeyProvider = 'aws' | 'azure' | 'gcp' | 'local' | 'kmip';

/**
 * @public
 * Configuration options that are used by specific KMS providers during key generation, encryption, and decryption.
 */
export interface KMSProviders {
  /**
   * Configuration options for using 'aws' as your KMS provider
   */
  aws?:
    | {
        /**
         * The access key used for the AWS KMS provider
         */
        accessKeyId: string;

        /**
         * The secret access key used for the AWS KMS provider
         */
        secretAccessKey: string;

        /**
         * An optional AWS session token that will be used as the
         * X-Amz-Security-Token header for AWS requests.
         */
        sessionToken?: string;
      }
    | Record<string, never>;

  /**
   * Configuration options for using 'local' as your KMS provider
   */
  local?: {
    /**
     * The master key used to encrypt/decrypt data keys.
     * A 96-byte long Buffer or base64 encoded string.
     */
    key: Buffer | string;
  };

  /**
   * Configuration options for using 'kmip' as your KMS provider
   */
  kmip?: {
    /**
     * The output endpoint string.
     * The endpoint consists of a hostname and port separated by a colon.
     * E.g. "example.com:123". A port is always present.
     */
    endpoint?: string;
  };

  /**
   * Configuration options for using 'azure' as your KMS provider
   */
  azure?:
    | {
        /**
         * The tenant ID identifies the organization for the account
         */
        tenantId: string;

        /**
         * The client ID to authenticate a registered application
         */
        clientId: string;

        /**
         * The client secret to authenticate a registered application
         */
        clientSecret: string;

        /**
         * If present, a host with optional port. E.g. "example.com" or "example.com:443".
         * This is optional, and only needed if customer is using a non-commercial Azure instance
         * (e.g. a government or China account, which use different URLs).
         * Defaults to "login.microsoftonline.com"
         */
        identityPlatformEndpoint?: string | undefined;
      }
    | {
        /**
         * If present, an access token to authenticate with Azure.
         */
        accessToken: string;
      }
    | Record<string, never>;

  /**
   * Configuration options for using 'gcp' as your KMS provider
   */
  gcp?:
    | {
        /**
         * The service account email to authenticate
         */
        email: string;

        /**
         * A PKCS#8 encrypted key. This can either be a base64 string or a binary representation
         */
        privateKey: string | Buffer;

        /**
         * If present, a host with optional port. E.g. "example.com" or "example.com:443".
         * Defaults to "oauth2.googleapis.com"
         */
        endpoint?: string | undefined;
      }
    | {
        /**
         * If present, an access token to authenticate with GCP.
         */
        accessToken: string;
      }
    | Record<string, never>;
}

/**
 * Auto credential fetching should only occur when the provider is defined on the kmsProviders map
 * and the settings are an empty object.
 *
 * This is distinct from a nullish provider key.
 *
 * @internal - exposed for testing purposes only
 */
export function isEmptyCredentials(
  providerName: ClientEncryptionDataKeyProvider,
  kmsProviders: KMSProviders
): boolean {
  const provider = kmsProviders[providerName];
  if (provider == null) {
    return false;
  }
  return typeof provider === 'object' && Object.keys(provider).length === 0;
}

/**
 * @internal
 *
 * A class that fetchs KMS credentials on-demand during client encryption.  This class is instantiated
 * per client encryption or auto encrypter and caches the AWS credential provider, if AWS is being used.
 */
export class KMSCredentialProvider {
  private _awsCredentialProvider?: AWSSDKCredentialProvider;
  private get awsCredentialProvider(): AWSSDKCredentialProvider {
    this._awsCredentialProvider ??= new AWSSDKCredentialProvider();
    return this._awsCredentialProvider;
  }

  constructor(private readonly kmsProviders: KMSProviders) {}

  /**
   * Load cloud provider credentials for the user provided KMS providers.
   * Credentials will only attempt to get loaded if they do not exist
   * and no existing credentials will get overwritten.
   */
  async refreshCredentials() {
    let finalKMSProviders = this.kmsProviders;

    if (isEmptyCredentials('aws', this.kmsProviders)) {
      // We shouldn't ever receive a response from the AWS SDK that doesn't have a `SecretAccessKey`
      // or `AccessKeyId`.  However, TS says these fields are optional.  We provide empty strings
      // and let libmongocrypt error if we're unable to fetch the required keys.
      const {
        SecretAccessKey = '',
        AccessKeyId = '',
        Token
      } = await this.awsCredentialProvider.getCredentials();
      const aws: NonNullable<KMSProviders['aws']> = {
        secretAccessKey: SecretAccessKey,
        accessKeyId: AccessKeyId
      };
      // the AWS session token is only required for temporary credentials
      Token != null && (aws.sessionToken = Token);

      finalKMSProviders = {
        ...this.kmsProviders,
        aws
      };
    }

    if (isEmptyCredentials('gcp', this.kmsProviders)) {
      finalKMSProviders = await loadGCPCredentials(finalKMSProviders);
    }

    if (isEmptyCredentials('azure', this.kmsProviders)) {
      finalKMSProviders = await loadAzureCredentials(finalKMSProviders);
    }
    return finalKMSProviders;
  }
}
