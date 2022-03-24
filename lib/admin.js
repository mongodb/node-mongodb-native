"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Admin = void 0;
const add_user_1 = require("./operations/add_user");
const execute_operation_1 = require("./operations/execute_operation");
const list_databases_1 = require("./operations/list_databases");
const remove_user_1 = require("./operations/remove_user");
const run_command_1 = require("./operations/run_command");
const validate_collection_1 = require("./operations/validate_collection");
/**
 * The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 *
 * **ADMIN Cannot directly be instantiated**
 * @public
 *
 * @example
 * ```js
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 *
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Use the admin database for the operation
 *   const adminDb = client.db(dbName).admin();
 *
 *   // List all the available databases
 *   adminDb.listDatabases(function(err, dbs) {
 *     expect(err).to.not.exist;
 *     test.ok(dbs.databases.length > 0);
 *     client.close();
 *   });
 * });
 * ```
 */
class Admin {
    /**
     * Create a new Admin instance
     * @internal
     */
    constructor(db) {
        this.s = { db };
    }
    command(command, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = Object.assign({ dbName: 'admin' }, options);
        return (0, execute_operation_1.executeOperation)(this.s.db, new run_command_1.RunCommandOperation(this.s.db, command, options), callback);
    }
    buildInfo(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.command({ buildinfo: 1 }, options, callback);
    }
    serverInfo(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.command({ buildinfo: 1 }, options, callback);
    }
    serverStatus(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.command({ serverStatus: 1 }, options, callback);
    }
    ping(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.command({ ping: 1 }, options, callback);
    }
    addUser(username, password, options, callback) {
        if (typeof password === 'function') {
            (callback = password), (password = undefined), (options = {});
        }
        else if (typeof password !== 'string') {
            if (typeof options === 'function') {
                (callback = options), (options = password), (password = undefined);
            }
            else {
                (options = password), (callback = undefined), (password = undefined);
            }
        }
        else {
            if (typeof options === 'function')
                (callback = options), (options = {});
        }
        options = Object.assign({ dbName: 'admin' }, options);
        return (0, execute_operation_1.executeOperation)(this.s.db, new add_user_1.AddUserOperation(this.s.db, username, password, options), callback);
    }
    removeUser(username, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = Object.assign({ dbName: 'admin' }, options);
        return (0, execute_operation_1.executeOperation)(this.s.db, new remove_user_1.RemoveUserOperation(this.s.db, username, options), callback);
    }
    validateCollection(collectionName, options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return (0, execute_operation_1.executeOperation)(this.s.db, new validate_collection_1.ValidateCollectionOperation(this, collectionName, options), callback);
    }
    listDatabases(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return (0, execute_operation_1.executeOperation)(this.s.db, new list_databases_1.ListDatabasesOperation(this.s.db, options), callback);
    }
    replSetGetStatus(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = options !== null && options !== void 0 ? options : {};
        return this.command({ replSetGetStatus: 1 }, options, callback);
    }
}
exports.Admin = Admin;
//# sourceMappingURL=admin.js.map