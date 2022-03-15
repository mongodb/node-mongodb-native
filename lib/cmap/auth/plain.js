"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plain = void 0;
const bson_1 = require("../../bson");
const error_1 = require("../../error");
const utils_1 = require("../../utils");
const auth_provider_1 = require("./auth_provider");
class Plain extends auth_provider_1.AuthProvider {
    auth(authContext, callback) {
        const { connection, credentials } = authContext;
        if (!credentials) {
            return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
        }
        const username = credentials.username;
        const password = credentials.password;
        const payload = new bson_1.Binary(Buffer.from(`\x00${username}\x00${password}`));
        const command = {
            saslStart: 1,
            mechanism: 'PLAIN',
            payload: payload,
            autoAuthorize: 1
        };
        connection.command((0, utils_1.ns)('$external.$cmd'), command, undefined, callback);
    }
}
exports.Plain = Plain;
//# sourceMappingURL=plain.js.map