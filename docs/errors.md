# Error Classes
All errors are derived from the `MongoError` class which should **never** be instantiated. There are five main error classes which stem from `MongoError`: `MongoLogicError`, `MongoRuntimeError`, `MongoNetworkError`, `MongoServerError`, and `MongoSystemError`.
## `MongoError`
The base class from which all errors in the Node driver subclass. `MongoError` should **never** be be directly instantiated.
![(MongoError hierarchy tree)](charts/output/MongoError.svg)
Children of `MongoError` include:
- [`MongoLogicError`](#MongoLogicError)
- [`MongoRuntimeError`](#MongoRuntimeError)
- [`MongoNetworkError`](#MongoNetworkError)
- [`MongoServerError`](#MongoServerError)
- [`MongoSystemError`](#MongoSystemError)


## `MongoLogicError`
This class represents errors which originate from misuse of the driver API and will generally be thrown before making contact with the server. This class should **never** be directly instantiated.
![(MongoLogicError hierarchy tree)](charts/output/MongoLogicError.svg)
Children of `MongoLogicError` include:

* #### `MongoInvalidArgumentError`
    * Thrown when the user supplies malformed, unexpected arguments or failed to provide a required argument or field.

* #### `MongoCompatibilityError`
    * Thrown when a feature that is not enabled or allowed for the current configuration is used.

* #### `MongoClientInstantiationError`
    * Thrown when a user supplies a poorly-formatted connection string to the MongoClient constructor.

* #### `MongoMissingCredentialsError`
    * Thrown when a user fails to provide authenticaiton credentials before attempting to connect to the server.

* #### `MongoDependencyError`
    * Thrown when a required module or dependency is not present.


## `MongoRuntimeError`
This class represents errors which occur when the driver encounters unexpected input or reaches an unexpected/invalid internal state. This class should **never** be directly instantiated.
![(MongoRuntimeError hierarchy tree)](charts/output/MongoRuntimeError.svg)
Children of `MongoRuntimeError` include:

* #### `MongoInternalDriverError`
	* Thrown when a catastrophic failure occurs in the driver.

* #### `MongoTransactionError`
	* Thrown when the user makes a mistake in the usage of transactions (e.g.: attempting to commit a transaction with a readPreference other than primary).

* #### `MongoClientNotConnectedError`
	* Thrown when the user attempts to operate on the data from a client that has not been connected to a MongoDB server instance.

* #### `MongoKerberosClientConnectionError`

* #### `MongoEncryptionError`
	* Thrown when an autoencrypter is requested but unavailable.

* #### `MongoCompressionError`
	* Thrown when the driver fails to compress data before sending it to the server.

* #### `MongoDecompressionError`
	* Thrown when the driver fails to decompress data received from the server

* #### `MongoExpiredSessionError`
	* Thrown when the user attempts to operate on a session that has expired or has been closed.

* #### `MongoIOError`
	* Thrown when the driver fails to read or write from a file.

* #### `MongoParseError`
	* Thrown when the driver fails to correctly parse otherwise properly supplied input.

* #### `MongoResourceClosedError`
	* Thrown when there is an attempt to access a resource which has already been or will be closed/destroyed.
    * Children of this error class include:
        * **`MongoServerClosedError`**: Thrown when an attempt is made to operate on a closed server.
        * **`MongoStreamClosedError`**: Thrown when an attempt is made to operate on a closed stream.
        * **`MongoTopologyClosedError`**: Thrown when an attempt is made to operate on a dropped, or otherwise unavailable, database.
* #### `MongoCursorError`
	* Thrown when the user incorrectly uses a cursor object.
    * Children of this error class include:
        * **`MongoInvalidCursorOperationError`**: Thrown when the user calls a function or method that is not supported on the current cursor.
        * **`MongoCursorExhaustedError`**: Thrown when an attempt is made to read from a cursor that has been exhausted.

* #### `MongoStreamError`
    * Thrown when a stream operation fails to execute.
    * Children of this error class include:
        * **`MongoChangeStreamError`**: Thrown when an error is encountered when operating on a ChangeStream.
        * **`MongoGridFSStreamError`**: Thrown when an unexpected state is reached when operating on a GridFSStream.
        * **`MongoGridFSChunkError`**: Thrown when a malformed or invalid chunk is encountered when reading from a GridFSStream.
* #### `MongoBatchReExecutionError`
    * Thrown when a user attempts

* #### `MongoServerSelectionError`
    * Thrown when the driver fails to select a server to complete an operation.


## `MongoNetworkError`
These are errors encountered at runtime which occur when the driver encounters an issue in the network which leads to an inability to connect to a mongo server instance. Children of this class include:

* #### `MongoNetworkTimeoutError`


## `MongoServerError`
These are errors which wrap error responses received from the server.


## `MongoSystemError`
These are errors which originate from faulty environment setup.
