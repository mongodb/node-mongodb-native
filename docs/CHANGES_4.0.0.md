# Changes in 4.x

WIP

## Versioned API

Versioned API is a new feature in MongoDB 5.0 that allows user-selectable API versions, subsets of MongoDB server semantics, to be declared on a client. During communication with a server, clients with a declared API version will force the server to behave in a manner compatible with the API version. Declaring an API version on a client can be used to ensure consistent responses from a server, providing long term API stability for an application. The declared API version is applied to all commands run through the client, including those sent through the generic RunCommand helper. Specifying versioned API options in the command document AND declaring an API version on the client is not supported and will lead to undefined behaviour.

### Declare an API version on a client:

```javascript
// Declare API version "1" for the client
client = new MongoClient(uri, { serverApi: { version: '1' } });

cursor = client.db('database').collection('coll').find(...);
```

### Strict mode

Declaring a `strict` API version will cause the MongoDB server to reject all commands that are not part of the declared API version. This includes command options and aggregation pipeline stages. For example, the following `find` call would fail because the `tailable` option is not part of version 1:

```javascript
// Declare API version "1" for the client, with strict on
client = new MongoClient(uri, { serverApi: { version: '1', strict: true } });

// Fails with an error
cursor = client.db('database').collection('coll').find({ ... }, { tailable: true });
```

### Deprecation Errors

The `deprecationErrors` option can be used to enable command failures when using functionality that is deprecated from version 1. Note that at the time of this writing, no deprecations in version 1 exist.

```javascript
// Declare API version "1" for the client, with deprecationErrors on
client = new MongoClient(uri, { serverApi: { version: '1', deprecationErrors: true } });

// Note: since API version "1" is the initial version, there are no deprecated commands to provide as an example yet.
```
