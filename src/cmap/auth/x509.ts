import { AuthProvider } from './auth_provider';

class X509 extends AuthProvider {
  prepare(handshakeDoc: any, authContext: any, callback: Function) {
    const { credentials } = authContext;
    Object.assign(handshakeDoc, {
      speculativeAuthenticate: x509AuthenticateCommand(credentials)
    });

    callback(undefined, handshakeDoc);
  }

  auth(authContext: any, callback: Function) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    const response = authContext.response;
    if (response.speculativeAuthenticate) {
      return callback();
    }

    connection.command('$external.$cmd', x509AuthenticateCommand(credentials), callback);
  }
}

function x509AuthenticateCommand(credentials: any) {
  const command: any = { authenticate: 1, mechanism: 'MONGODB-X509' };
  if (credentials.username) {
    command.user = credentials.username;
  }

  return command;
}

export = X509;
