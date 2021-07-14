# Feature Highlights

## Versioned API

Versioned API is a new feature in MongoDB 5.0 that allows user-selectable API versions, subsets of MongoDB server semantics, to be declared on a client.
During communication with a server, clients with a declared API version will force the server to behave in a manner compatible with the API version.
Declaring an API version on a client can be used to ensure consistent responses from a server, providing long term API stability for an application. The declared API version is applied to all commands run through the client, including those sent through the generic RunCommand helper.
Specifying versioned API options in the command document AND declaring an API version on the client is not supported and will lead to undefined behavior.

### Declare an API version on a client

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

## Features List

* [`NODE-3392`](https://jira.mongodb.org/browse/NODE-3392): enable snapshot reads on secondaries ([#2897](https://github.com/mongodb/node-mongodb-native/pull/2897)) ([523e05c](https://github.com/mongodb/node-mongodb-native/commit/523e05c3684dcf98c8bbfa4f0631092debd8a85c))
* [`NODE-2751`](https://jira.mongodb.org/browse/NODE-2751): add arrayFilters builder to bulk FindOperators ([#2820](https://github.com/mongodb/node-mongodb-native/issues/2820)) ([d099622](https://github.com/mongodb/node-mongodb-native/commit/d099622cdd1ba60d108b1b6a1b323dff847f99b5))
* [`NODE-3274`](https://jira.mongodb.org/browse/NODE-3274): add type hinting for UpdateFilter ([#2842](https://github.com/mongodb/node-mongodb-native/issues/2842)) ([05035eb](https://github.com/mongodb/node-mongodb-native/commit/05035eb2d7bdb0820181de5f86f0004cc77c1c00))
* [`NODE-3325`](https://jira.mongodb.org/browse/NODE-3325): support 'let' option for aggregate command ([#2828](https://github.com/mongodb/node-mongodb-native/issues/2828)) ([e38838e](https://github.com/mongodb/node-mongodb-native/commit/e38838e28d075126c8702de18247230d05965e11))
* [`NODE-3331`](https://jira.mongodb.org/browse/NODE-3331): offer downleveled types for legacy typescript versions ([#2859](https://github.com/mongodb/node-mongodb-native/issues/2859)) ([27cf1d2](https://github.com/mongodb/node-mongodb-native/commit/27cf1d241549c06fb69aee313176d87dcd13514a))
* [`NODE-3333`](https://jira.mongodb.org/browse/NODE-3333): support 'let' option for CRUD commands ([#2829](https://github.com/mongodb/node-mongodb-native/issues/2829)) ([0d91da1](https://github.com/mongodb/node-mongodb-native/commit/0d91da1b1388e6946ec991fee82f92647a199ece))
* [`NODE-3115`](https://jira.mongodb.org/browse/NODE-3115): add generic parameterization ([#2767](https://github.com/mongodb/node-mongodb-native/issues/2767)) ([4d12491](https://github.com/mongodb/node-mongodb-native/commit/4d12491a7ef12488bc9b4f0c5b8428d29d687132))
* [`NODE-3132`](https://jira.mongodb.org/browse/NODE-3132): add TypedEventEmitter ([#2785](https://github.com/mongodb/node-mongodb-native/issues/2785)) ([f4d40a4](https://github.com/mongodb/node-mongodb-native/commit/f4d40a4c2bf1ace188e624f5c7d5852d5395e00a))
* [`NODE-3106`](https://jira.mongodb.com/browse/NODE-3106): add fermium to evergreen test runs ([#2762](https://github.com/mongodb/node-mongodb-native/issues/2762)) ([2303b41](https://github.com/mongodb/node-mongodb-native/commit/2303b418b461b3c965f0c48f160d812153eba11e))
* [`NODE-2950`](https://jira.mongodb.com/browse/NODE-2950): versioned api ([#2736](https://github.com/mongodb/node-mongodb-native/issues/2736)) ([93f3ea5](https://github.com/mongodb/node-mongodb-native/commit/93f3ea5815bbd85b90745716f35849a59e8f8746))
* [`NODE-2806`](https://jira.mongodb.com/browse/NODE-2806): add `withReadConcern` builder to AbstractCursor ([#2645](https://github.com/mongodb/node-mongodb-native/issues/2645)) ([0cca729](https://github.com/mongodb/node-mongodb-native/commit/0cca729eb94ee942b775e14d57c44d57beda3fce))
* [`NODE-2917`](https://jira.mongodb.com/browse/NODE-2917): add an internal `tryNext` method ([#2638](https://github.com/mongodb/node-mongodb-native/issues/2638)) ([43c94b6](https://github.com/mongodb/node-mongodb-native/commit/43c94b6d40824c6cfa531d6ee9ac6b307e4cbcc6))
* [`NODE-2569`](https://jira.mongodb.com/browse/NODE-2569): add commitQuorum option to createIndexes command ([#2345](https://github.com/mongodb/node-mongodb-native/pull/2345)) ([168a952](https://github.com/mongodb/node-mongodb-native/commit/168a952f60787f325b202c539a664b9e14451b65))
* [`NODE-2853`](https://jira.mongodb.com/browse/NODE-2853): add explain support for cursor commands  ([#2622](https://github.com/mongodb/node-mongodb-native/issues/2622)) ([bb1e081](https://github.com/mongodb/node-mongodb-native/commit/bb1e081e366612e0872d3c5ec0fadbb61e202ad6))
* [`NODE-2852`](https://jira.mongodb.com/browse/NODE-2852): add explain support for non-cursor commands ([#2599](https://github.com/mongodb/node-mongodb-native/issues/2599)) ([4472308](https://github.com/mongodb/node-mongodb-native/commit/447230826cd764e2b766d3178d4fa369f8a4ebc4))
* [`NODE-2288`](https://jira.mongodb.com/browse/NODE-2288): add MONGODB-AWS as a supported auth mechanism ([7f3cfba](https://github.com/mongodb/node-mongodb-native/commit/7f3cfbac15f537aa2ca9da145063f10c61390406))
* [`NODE-2699`](https://jira.mongodb.com/browse/NODE-2699): add MongoOption builder logic ([#2623](https://github.com/mongodb/node-mongodb-native/issues/2623)) ([cb9ee9e](https://github.com/mongodb/node-mongodb-native/commit/cb9ee9e6175a6654c3c300801884e4a3c3a653ac))
* [`NODE-2871`](https://jira.mongodb.com/browse/NODE-2871): implement post-assignment operations (tls, dns, aliases) ([#2623](https://github.com/mongodb/node-mongodb-native/issues/2623)) ([cb9ee9e](https://github.com/mongodb/node-mongodb-native/commit/cb9ee9e6175a6654c3c300801884e4a3c3a653ac))
* [`NODE-2698`](https://jira.mongodb.com/browse/NODE-2698): add MongoOptions interface ([#2616](https://github.com/mongodb/node-mongodb-native/issues/2616)) ([54c456b](https://github.com/mongodb/node-mongodb-native/commit/54c456b4a4ff51c4f6734cff550d8aa53a47db15))
* [`NODE-2932`](https://jira.mongodb.com/browse/NODE-2932): add types for the result of bulk initialize methods ([#2654](https://github.com/mongodb/node-mongodb-native/issues/2654)) ([3e5ff57](https://github.com/mongodb/node-mongodb-native/commit/3e5ff57d6438add80c1bad932114f3d086f1cc29))
* [`NODE-2591`](https://jira.mongodb.com/browse/NODE-2591): adds "hidden" option when creating indexes ([#2548](https://github.com/mongodb/node-mongodb-native/pull/2548)) ([ee8ca1a](https://github.com/mongodb/node-mongodb-native/commit/ee8ca1aaddd1da33689a49c99dcc1c6f42b6f9dd))
* [`NODE-2590`](https://jira.mongodb.com/browse/NODE-2590): adds async iterator for custom promises ([#2578](https://github.com/mongodb/node-mongodb-native/pull/2578)) ([16d6572](https://github.com/mongodb/node-mongodb-native/commit/16d65722a5b2318eee014511c94385e9d4f60ed7))
* [`NODE-2477`](https://jira.mongodb.com/browse/NODE-2477): allow hinting the delete command ([#2302](https://github.com/mongodb/node-mongodb-native/pull/2302)) ([95fedf4](https://github.com/mongodb/node-mongodb-native/commit/95fedf4ecf2da73802a4146ab0c7df6a0850103c))
* [`NODE-2150`](https://jira.mongodb.com/browse/NODE-2150): bump wire protocol version for 4.4 ([6d3f313](https://github.com/mongodb/node-mongodb-native/commit/6d3f313a9defd12489b621896439b3f9ec8cb1ae))
* [`NODE-1452`](https://jira.mongodb.com/browse/NODE-1452): convert the entire codebase to TypeScript ([272bc18](https://github.com/mongodb/node-mongodb-native/commit/272bc18f51351a9f18d6d1bc68413c1a0c1f649f))
* [`NODE-2452`](https://jira.mongodb.com/browse/NODE-2452): directConnection adds unify behavior for replica set discovery ([#2349](https://github.com/mongodb/node-mongodb-native/issues/2349)) ([34c9195](https://github.com/mongodb/node-mongodb-native/commit/34c9195251adeeb1c9e8bc4234c8afb076d1d60e))
* [`NODE-2379`](https://jira.mongodb.com/browse/NODE-2379): expand use of error labels for retryable writes ([c775a4a](https://github.com/mongodb/node-mongodb-native/commit/c775a4a1c53b8476eff6c9759b5647c9cbfa4e04))
* [`NODE-2579`](https://jira.mongodb.com/browse/NODE-2579): implements promise provider ([#2348](https://github.com/mongodb/node-mongodb-native/pull/2348)) ([e5b762c](https://github.com/mongodb/node-mongodb-native/commit/e5b762c6d53afa967f24c26a1d1b6c921757c9c9))
* [`NODE-2704`](https://jira.mongodb.com/browse/NODE-2704): integrate MongoOptions parser into driver ([#2680](https://github.com/mongodb/node-mongodb-native/issues/2680)) ([b1bdb06](https://github.com/mongodb/node-mongodb-native/commit/b1bdb06cbe95fd320afff00ccb8fea666c79b444))
* [`NODE-2809`](https://jira.mongodb.com/browse/NODE-2809): introduce AbstractCursor and its concrete subclasses ([#2619](https://github.com/mongodb/node-mongodb-native/issues/2619)) ([a2d78b2](https://github.com/mongodb/node-mongodb-native/commit/a2d78b22b28ae649fa2c4e28294a3a03c446373e))
* [`NODE-2930`](https://jira.mongodb.com/browse/NODE-2930): introduce BufferPool to replace BufferList ([#2669](https://github.com/mongodb/node-mongodb-native/issues/2669)) ([3c56efc](https://github.com/mongodb/node-mongodb-native/commit/3c56efcf25a9ca8085a37f2ebac8cb3bff6d6d6c))
* [`NODE-2811`](https://jira.mongodb.com/browse/NODE-2811): reintroduce clone and rewind for cursors ([#2647](https://github.com/mongodb/node-mongodb-native/issues/2647)) ([a5154fb](https://github.com/mongodb/node-mongodb-native/commit/a5154fb5977dddd88e57f9d20965e95fa7ddb80b))
* [`NODE-2289`](https://jira.mongodb.com/browse/NODE-2289): support `allowDiskUse` for find commands ([dbc0b37](https://github.com/mongodb/node-mongodb-native/commit/dbc0b3722516a128c253bf85366a3432756ff92a))
* [`NODE-2295`](https://jira.mongodb.com/browse/NODE-2295): support creating collections and indexes in transactions ([917f2b0](https://github.com/mongodb/node-mongodb-native/commit/917f2b088f22f4c6ed803f0349859d057389ac1e))
* [`NODE-2757`](https://jira.mongodb.com/browse/NODE-2757): add collation to FindOperators ([#2679](https://github.com/mongodb/node-mongodb-native/issues/2679)) ([a41d503](https://github.com/mongodb/node-mongodb-native/commit/a41d503ebd061977e712ac26dc7c757ab03cab14))
* [`NODE-2510`](https://jira.mongodb.com/browse/NODE-2510): support hedged reads ([#2350](https://github.com/mongodb/node-mongodb-native/pull/2350)) ([2b7b936](https://github.com/mongodb/node-mongodb-native/commit/2b7b936b532c1461dba59a4840978beea7b934fb))
* [`NODE-2290`](https://jira.mongodb.com/browse/NODE-2290): support passing a hint to findOneAndReplace/findOneAndUpdate ([faee15b](https://github.com/mongodb/node-mongodb-native/commit/faee15b686b895b84fd0b52c1e69e0caec769732))
* [`NODE-2301`](https://jira.mongodb.com/browse/NODE-2301): support shorter SCRAM conversations ([6b9ff05](https://github.com/mongodb/node-mongodb-native/commit/6b9ff0561d14818bf07f4946ade04fc54683d0b9))
* [`NODE-2955`](https://jira.mongodb.com/browse/NODE-2955): fluent builder for allowDiskUse option ([#2678](https://github.com/mongodb/node-mongodb-native/issues/2678)) ([d442aac](https://github.com/mongodb/node-mongodb-native/commit/d442aac66e7a236decdfbeb5be0cc8a163486534))
* [`NODE-2487`](https://jira.mongodb.com/browse/NODE-2487): support speculative authentication in scram-sha and x509 ([#2353](https://github.com/mongodb/node-mongodb-native/pull/2353)) ([f71f09b](https://github.com/mongodb/node-mongodb-native/commit/f71f09bd466f0630bbe6859d8ed074ecd5f4a51f))
* [`NODE-2379`](https://jira.mongodb.com/browse/NODE-2379): use error labels for retryable writes in legacy topologies ([fefc165](https://github.com/mongodb/node-mongodb-native/commit/fefc1651a885ec28758271c9e3c36104b05bdb75))
* `NO TICKET`: options object precedence over URI options ([#2691](https://github.com/mongodb/node-mongodb-native/issues/2691)) ([85d8d09](https://github.com/mongodb/node-mongodb-native/commit/85d8d09713e2a80442dfbb38ecc887204306ba17))
* `NO TICKET`: introduce an interruptable async interval timer ([21cbabd](https://github.com/mongodb/node-mongodb-native/commit/21cbabdb1cf9ebee887bda547aa9116781cf03ae))
* `NO TICKET`: support the streaming protocol for topology updates ([7e9c5bc](https://github.com/mongodb/node-mongodb-native/commit/7e9c5bc5e8b10ae146d80535a44221ddb9ded069))
