"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = exports.AuthContext = void 0;
const error_1 = require("../../error");
/** Context used during authentication */
class AuthContext {
    constructor(connection, credentials, options) {
        this.connection = connection;
        this.credentials = credentials;
        this.options = options;
    }
}
exports.AuthContext = AuthContext;
class AuthProvider {
    /**
     * Prepare the handshake document before the initial handshake.
     *
     * @param handshakeDoc - The document used for the initial handshake on a connection
     * @param authContext - Context for authentication flow
     */
    prepare(handshakeDoc, authContext, callback) {
        callback(undefined, handshakeDoc);
    }
    /**
     * Authenticate
     *
     * @param context - A shared context for authentication flow
     * @param callback - The callback to return the result from the authentication
     */
    auth(context, callback) {
        // TODO(NODE-3483): Replace this with MongoMethodOverrideError
        callback(new error_1.MongoRuntimeError('`auth` method must be overridden by subclass'));
    }
}
exports.AuthProvider = AuthProvider;
//# sourceMappingURL=auth_provider.js.map