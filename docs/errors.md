# Errors

## Error Hierarchy

## Error Classes

### MongoError

The base class from which all errors in the Node driver subclass. This should never be dierctly instantiated

#### MongoDriverError

##### MongoLogicError

These are errors which originate from misuse of the driver API and will generally be thrown before making contact with the server. This class should never be directly instantiated.

###### MongoInvalidArgumentError

This error is thrown when the user supplies a malformed, unexpected arguments or failed to provide a required argument or field.

###### MongoCompatibilityError

This error is thrown when a feature that is not enabled or allowed for the current configuration.

###### MongoClientInstantiationError

This error is thrown when a user supplies a poorly-formatted connection string to the MongoClient constructor.

###### MongoMissingCredentialsError

This error is thrown when a user fails to provide authenticaiton credentials before attempting to connect to the server.

###### MongoDependencyError

This error is thrown when a required module or dependency is not present.



##### MongoRuntimeError

These are errors which occur when the driver encounters unexpected input or reaches and unexpected or invalid internal state. This class should never be directly instantiated.

###### MongoResourceClosedError

This error is thrown when there is an attempt to access a resource which has already been closed/destroyed.

###### MongoBatchReExecutionError

###### MongoCursorError

This error is thrown when the user incorrectly makes use of a cursor object. 

###### MongoInvalidCursorOperationError

This error is thrown when the user calls a function or method that is not supported on the current cursor.

###### MongoClientNotConnectedError

This error is thrown when the user attempts to operate on the data from a client that has not been connected to a Mongo server instance.

###### MongoTransactionError

This error is thrown when the user makes a mistake in the usage of transactions. e.g. : attempting to commit a transaction with a readPreference other than primary.

###### MongoExpiredSessionError

This error is thrown when the user attempts to operate on a session that has expired or has been closed.

###### MongoServerClosedError

###### MongoKerberosClientConnectionError

###### MongoInternalDriverError

This error is thrown when a catastrophic failure occurs in the driver.

###### MongoStreamError

###### MongoChangeStreamError

This error is thrown when an error is encountered when operating on a ChangeStream

###### MongoGridFSStreamError

This error is thrown when an unexpected state is reached when operating on a GridFSStream

###### MongoGridFSChunkError

This error is thrown when a malformed or invalid chunk is encountered when reading from a GridFSStream

###### MongoStreamClosedError

This error is thrown when an attempt is made to read from a closed stream

###### MongoDecompressionError

This error is thrown when the driver fails to decompress data received from the server

###### MongoCompressionError

This error is thrown when the driver fails to compress data before sending it to the server.

###### MongoEncryptionError

This error is thrown when an autoencrypter is requested but unavailable.

###### MongoParseError

This error is thrown when the driver fails to correctly parse otherwise properly supplied input.

###### MongoCursorExhaustedError

This error is thrown when an attempt is made to read from a cursor that has been exhausted.

###### MongoTopologyClosedError

###### MongoIOError

This error is thrown when the driver fails to read or write from a file



#### MongoNetworkError

These are errors encountered at runtime which occur when the driver encounters an issue in the network which leads to an inability to connect to a mongo server instance.

#### MongoServerError

These are errors which wrap error responses received from the server.

##### MongoNetworkTimeoutError

### MongoSystemError

These are errors which originate from faulty environment setup.

