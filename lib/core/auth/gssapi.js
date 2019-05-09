'use strict';

const AuthProvider = require('./auth_provider').AuthProvider;
const retrieveKerberos = require('../utils').retrieveKerberos;
let kerberos;

/**
 * Creates a new GSSAPI authentication mechanism
 * @class
 * @extends AuthProvider
 */
class GSSAPI extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(sendAuthCommand, connection, credentials, callback) {
    const source = credentials.source;
    const username = credentials.username;
    const password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const gssapiServiceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

    GSSAPIInitialize(
      this,
      kerberos.processes.MongoAuthProcess,
      source,
      username,
      password,
      source,
      gssapiServiceName,
      sendAuthCommand,
      connection,
      mechanismProperties,
      callback
    );
  }

  /**
   * Authenticate
   * @override
   * @method
   */
  auth(sendAuthCommand, connections, credentials, callback) {
    if (kerberos == null) {
      try {
        kerberos = retrieveKerberos();
      } catch (e) {
        return callback(e, null);
      }
    }

    super.auth(sendAuthCommand, connections, credentials, callback);
  }
}

//
// Initialize step
var GSSAPIInitialize = function(
  self,
  MongoAuthProcess,
  db,
  username,
  password,
  authdb,
  gssapiServiceName,
  sendAuthCommand,
  connection,
  options,
  callback
) {
  // Create authenticator
  var mongo_auth_process = new MongoAuthProcess(
    connection.host,
    connection.port,
    gssapiServiceName,
    options
  );

  // Perform initialization
  mongo_auth_process.init(username, password, function(err) {
    if (err) return callback(err, false);

    // Perform the first step
    mongo_auth_process.transition('', function(err, payload) {
      if (err) return callback(err, false);

      // Call the next db step
      MongoDBGSSAPIFirstStep(
        self,
        mongo_auth_process,
        payload,
        db,
        username,
        password,
        authdb,
        sendAuthCommand,
        connection,
        callback
      );
    });
  });
};

//
// Perform first step against mongodb
var MongoDBGSSAPIFirstStep = function(
  self,
  mongo_auth_process,
  payload,
  db,
  username,
  password,
  authdb,
  sendAuthCommand,
  connection,
  callback
) {
  // Build the sasl start command
  var command = {
    saslStart: 1,
    mechanism: 'GSSAPI',
    payload: payload,
    autoAuthorize: 1
  };

  // Write the commmand on the connection
  sendAuthCommand(connection, '$external.$cmd', command, (err, doc) => {
    if (err) return callback(err, false);
    // Execute mongodb transition
    mongo_auth_process.transition(doc.payload, function(err, payload) {
      if (err) return callback(err, false);

      // MongoDB API Second Step
      MongoDBGSSAPISecondStep(
        self,
        mongo_auth_process,
        payload,
        doc,
        db,
        username,
        password,
        authdb,
        sendAuthCommand,
        connection,
        callback
      );
    });
  });
};

//
// Perform first step against mongodb
var MongoDBGSSAPISecondStep = function(
  self,
  mongo_auth_process,
  payload,
  doc,
  db,
  username,
  password,
  authdb,
  sendAuthCommand,
  connection,
  callback
) {
  // Build Authentication command to send to MongoDB
  var command = {
    saslContinue: 1,
    conversationId: doc.conversationId,
    payload: payload
  };

  // Execute the command
  // Write the commmand on the connection
  sendAuthCommand(connection, '$external.$cmd', command, (err, doc) => {
    if (err) return callback(err, false);
    // Call next transition for kerberos
    mongo_auth_process.transition(doc.payload, function(err, payload) {
      if (err) return callback(err, false);

      // Call the last and third step
      MongoDBGSSAPIThirdStep(
        self,
        mongo_auth_process,
        payload,
        doc,
        db,
        username,
        password,
        authdb,
        sendAuthCommand,
        connection,
        callback
      );
    });
  });
};

var MongoDBGSSAPIThirdStep = function(
  self,
  mongo_auth_process,
  payload,
  doc,
  db,
  username,
  password,
  authdb,
  sendAuthCommand,
  connection,
  callback
) {
  // Build final command
  var command = {
    saslContinue: 1,
    conversationId: doc.conversationId,
    payload: payload
  };

  // Execute the command
  sendAuthCommand(connection, '$external.$cmd', command, (err, r) => {
    if (err) return callback(err, false);
    mongo_auth_process.transition(null, function(err) {
      if (err) return callback(err, null);
      callback(null, r);
    });
  });
};

/**
 * This is a result from a authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = GSSAPI;
