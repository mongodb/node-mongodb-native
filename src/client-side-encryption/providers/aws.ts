import { AWSSDKCredentialProvider } from '../../cmap/auth/aws_temporary_credentials';
import { type KMSProviders } from '.';

/**
 * @internal
 */
export async function loadAWSCredentials(kmsProviders: KMSProviders): Promise<KMSProviders> {
  const credentialProvider = new AWSSDKCredentialProvider();

  // The state machine is the only place calling this so it will
  // catch if there is a rejection here.
  const {
    SecretAccessKey = '',
    Token = '',
    AccessKeyId = ''
  } = await credentialProvider.getCredentials();
  return {
    ...kmsProviders,
    aws: {
      secretAccessKey: SecretAccessKey,
      sessionToken: Token,
      accessKeyId: AccessKeyId
    }
  };
}
