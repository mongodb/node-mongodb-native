"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X509 = void 0;
const error_1 = require("../../error");
const utils_1 = require("../../utils");
const auth_provider_1 = require("./auth_provider");
class X509 extends auth_provider_1.AuthProvider {
    prepare(handshakeDoc, authContext, callback) {
        const { credentials } = authContext;
        if (!credentials) {
            return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
        }
        Object.assign(handshakeDoc, {
            speculativeAuthenticate: x509AuthenticateCommand(credentials)
        });
        callback(undefined, handshakeDoc);
    }
    auth(authContext, callback) {
        const connection = authContext.connection;
        const credentials = authContext.credentials;
        if (!credentials) {
            return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
        }
        const response = authContext.response;
        if (response && response.speculativeAuthenticate) {
            return callback();
        }
        connection.command((0, utils_1.ns)('$external.$cmd'), x509AuthenticateCommand(credentials), undefined, callback);
    }
}
exports.X509 = X509;
function x509AuthenticateCommand(credentials) {
    const command = { authenticate: 1, mechanism: 'MONGODB-X509' };
    if (credentials.username) {
        command.user = credentials.username;
    }
    return command;
}
//# sourceMappingURL=x509.js.map