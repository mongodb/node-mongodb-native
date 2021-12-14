# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [4.2.2](https://github.com/mongodb/node-mongodb-native/compare/v4.2.1...v4.2.2) (2021-12-13)

### Bug Fixes

* **NODE-3705:** ReadPreference.fromOptions omitting hedge and maxStalenessSeconds when readPreference is a string ([#3060](https://github.com/mongodb/node-mongodb-native/issues/3060)) ([b9fbac5](https://github.com/mongodb/node-mongodb-native/commit/b9fbac5b13e0305a196f05b30b25111632f3ef13))
* **NODE-3711:** retry txn end on retryable write ([#3045](https://github.com/mongodb/node-mongodb-native/issues/3045)) ([7b00d0f](https://github.com/mongodb/node-mongodb-native/commit/7b00d0f06052b5302583fedec15796142cb151cf))
* **NODE-3765:** make replacement for replaceOne operations without _id ([#3040](https://github.com/mongodb/node-mongodb-native/issues/3040)) ([e07e564](https://github.com/mongodb/node-mongodb-native/commit/e07e564dc073eee12d12c98635f7d61a04665251))
* stricter protocol check in connection string ([#3078](https://github.com/mongodb/node-mongodb-native/issues/3078)) ([bc05671](https://github.com/mongodb/node-mongodb-native/commit/bc056719dac0b34cbfd59ac544f92a992f30ca76))

### [4.2.1](https://github.com/mongodb/node-mongodb-native/compare/v4.2.0...v4.2.1) (2021-11-30)


### Bug Fixes

* **NODE-2370:** correct a return type of hasNext() ([#3058](https://github.com/mongodb/node-mongodb-native/issues/3058)) ([b6a63df](https://github.com/mongodb/node-mongodb-native/commit/b6a63df6269898fb09dd180b512197822727e90a))
* **NODE-3627:** Enable flexible BSON validation for server error key containing invalid utf-8 ([#3054](https://github.com/mongodb/node-mongodb-native/issues/3054)) ([7a507f0](https://github.com/mongodb/node-mongodb-native/commit/7a507f08905d2e30f4c4b53adf0bf506e65e357f))
* **NODE-3648:** run get more ops through server selection ([#3030](https://github.com/mongodb/node-mongodb-native/issues/3030)) ([268e211](https://github.com/mongodb/node-mongodb-native/commit/268e2110c0a26e51fa82f42e84251a21fa30a5d0))
* **NODE-3767:** don't delete dbName if authSource is provided ([#3055](https://github.com/mongodb/node-mongodb-native/issues/3055)) ([0a830e2](https://github.com/mongodb/node-mongodb-native/commit/0a830e240adcd8564b6f11d8af0da50a411db58f))
* **NODE-3770:** Filter type uses WithId on the schema ([#3053](https://github.com/mongodb/node-mongodb-native/issues/3053)) ([307d623](https://github.com/mongodb/node-mongodb-native/commit/307d623ea597c5d89c548b6731bd692fec7a8047))

## [4.2.0](https://github.com/mongodb/node-mongodb-native/compare/v4.1.3...v4.2.0) (2021-11-17)


### Features

* **NODE-3083:** support aggregate writes on secondaries ([#3022](https://github.com/mongodb/node-mongodb-native/issues/3022)) ([f696909](https://github.com/mongodb/node-mongodb-native/commit/f69690917c2355619027872b676bdaeeb254e427))
* **NODE-3446:** deprecate mapReduce command ([#3036](https://github.com/mongodb/node-mongodb-native/issues/3036)) ([b6c73bf](https://github.com/mongodb/node-mongodb-native/commit/b6c73bf7ec71204eceee34dce4fc572830072cd0))
* **NODE-3467:** implement srvMaxHosts, srvServiceName options ([#3031](https://github.com/mongodb/node-mongodb-native/issues/3031)) ([1f8b539](https://github.com/mongodb/node-mongodb-native/commit/1f8b539cd3d60dd9f36baa22fd287241b5c65380))
* **NODE-3469,NODE-3615,NODE-3507:** update min and max wire versions ([#3014](https://github.com/mongodb/node-mongodb-native/issues/3014)) ([2a78d5a](https://github.com/mongodb/node-mongodb-native/commit/2a78d5a185ce1a6e8f35ce89dae479fcd0877bc6))
* **NODE-3691:** make time series options granularity type strict ([#3005](https://github.com/mongodb/node-mongodb-native/issues/3005)) ([98017f9](https://github.com/mongodb/node-mongodb-native/commit/98017f9f7f7c218de7eeb44fb14d749d774acc38))
* **NODE-3692:** make change stream events typing more generic ([#3034](https://github.com/mongodb/node-mongodb-native/issues/3034)) ([d5ae78e](https://github.com/mongodb/node-mongodb-native/commit/d5ae78ed73c1d7a850b9a830d1a9ef5c6b963bfb))
* **NODE-3728:** Allow to pass `authorizedCollections` option to the `db.listCollections` method ([#3021](https://github.com/mongodb/node-mongodb-native/issues/3021)) ([e1234a7](https://github.com/mongodb/node-mongodb-native/commit/e1234a795f05ed687014651c154c8b9f9e8f2cbb))
* **NODE-3729:** add withId to default return type for collection.find and collection.findOne ([#3039](https://github.com/mongodb/node-mongodb-native/issues/3039)) ([52520aa](https://github.com/mongodb/node-mongodb-native/commit/52520aac08ddb73888c7e6ee133f94ab5a481094))


### Bug Fixes

* **NODE-3116:** reschedule unreliable async interval first ([#3006](https://github.com/mongodb/node-mongodb-native/issues/3006)) ([33886a7](https://github.com/mongodb/node-mongodb-native/commit/33886a7ca5601b687d4be1062b5fe8583ec54b6d))
* **NODE-3344:** allow setting `defaultTransactionOptions` with POJO rather than ReadConcern instance ([#3032](https://github.com/mongodb/node-mongodb-native/issues/3032)) ([53b3164](https://github.com/mongodb/node-mongodb-native/commit/53b3164b8ceb19c8c8be8b5084fd03476f5635b9))
* **NODE-3515:** do proper opTime merging in bulk results ([#3012](https://github.com/mongodb/node-mongodb-native/issues/3012)) ([43300c3](https://github.com/mongodb/node-mongodb-native/commit/43300c393a190c00f174bc5be0b3fc6d0906e970))
* **NODE-3668:** compile error with OptionalId on TS 4.5 beta ([#3004](https://github.com/mongodb/node-mongodb-native/issues/3004)) ([ee7f095](https://github.com/mongodb/node-mongodb-native/commit/ee7f095e28aacf07014de8055ce75b16a92a8965))
* **NODE-3726:** add optional option overloads of Db's createCollection function ([#3019](https://github.com/mongodb/node-mongodb-native/issues/3019)) ([c3149e1](https://github.com/mongodb/node-mongodb-native/commit/c3149e17f301e7333fb5504b58b01e74f324c8e3))
* **NODE-3727:** add overloads for BulkOperationBase's execute function ([#3018](https://github.com/mongodb/node-mongodb-native/issues/3018)) ([216d194](https://github.com/mongodb/node-mongodb-native/commit/216d1949301438b74ed71da8af9bb766bcbdbf92))

### [4.1.3](https://github.com/mongodb/node-mongodb-native/compare/v4.1.2...v4.1.3) (2021-10-05)


### Bug Fixes

* **NODE-3609:** correct listDatabases return type ([#2986](https://github.com/mongodb/node-mongodb-native/issues/2986)) ([a8e9938](https://github.com/mongodb/node-mongodb-native/commit/a8e9938abcb00b67816438fb7c9db890e35d63c9))
* **NODE-3624:** Incorrect default aggregation generic type ([#2987](https://github.com/mongodb/node-mongodb-native/issues/2987)) ([440517e](https://github.com/mongodb/node-mongodb-native/commit/440517edb3980135dd9fcdbc9e96b5fec8baa067))

### [4.1.2](https://github.com/mongodb/node-mongodb-native/compare/v4.1.1...v4.1.2) (2021-09-14)


### Bug Fixes

* **NODE-3434:** errInfo should be exposed on bulk write ([#2977](https://github.com/mongodb/node-mongodb-native/issues/2977)) ([6b3c161](https://github.com/mongodb/node-mongodb-native/commit/6b3c161675df30b728a9fecfdb7ac7dcb8461598))
* **NODE-3467:** allow object type for aggregate out helper ([#2971](https://github.com/mongodb/node-mongodb-native/issues/2971)) ([cd603e8](https://github.com/mongodb/node-mongodb-native/commit/cd603e8c78f24422dcad4c65e9ca22eed94aa55e))
* **NODE-3487:** check for nullish aws mechanism property ([#2951](https://github.com/mongodb/node-mongodb-native/issues/2951)) ([78ec0dd](https://github.com/mongodb/node-mongodb-native/commit/78ec0ddabb3c875b204abc748910515d8344d711))
* **NODE-3559:** incorrect GridFS stream type ([#2981](https://github.com/mongodb/node-mongodb-native/issues/2981)) ([3915ea8](https://github.com/mongodb/node-mongodb-native/commit/3915ea83f546588817c291b6aa8c0e712c5bcdd8))
* **NODE-3567:** correct typing on aggregation out helper ([#2967](https://github.com/mongodb/node-mongodb-native/issues/2967)) ([a299a0b](https://github.com/mongodb/node-mongodb-native/commit/a299a0bf30decef451b4fd3218ea2c9719fd962e))
* **NODE-3574:** reintroduce ObjectID export ([#2965](https://github.com/mongodb/node-mongodb-native/issues/2965)) ([2291119](https://github.com/mongodb/node-mongodb-native/commit/2291119512160d6d0bef9215f95d60264cd225ab))
* **NODE-3585:** MongoClientOptions#compressors has incorrect type ([#2976](https://github.com/mongodb/node-mongodb-native/issues/2976)) ([f1b896d](https://github.com/mongodb/node-mongodb-native/commit/f1b896de6cbea212cf877696977300c7fa394a1a))
* **NODE-3591:** tlsCertificateKeyFile option does not default cert ([#2979](https://github.com/mongodb/node-mongodb-native/issues/2979)) ([6d42267](https://github.com/mongodb/node-mongodb-native/commit/6d42267925947793af88d8d810790cade3545ea8))
* **NODE-3599:** incorrect indexes return type ([#2980](https://github.com/mongodb/node-mongodb-native/issues/2980)) ([122b9f3](https://github.com/mongodb/node-mongodb-native/commit/122b9f3045368f2bd71c635ed4fe12ddf4e16e4c))

### [4.1.1](https://github.com/mongodb/node-mongodb-native/compare/v4.1.0...v4.1.1) (2021-08-24)


### Bug Fixes

* **NODE-3454:** projection types are too narrow ([#2924](https://github.com/mongodb/node-mongodb-native/issues/2924)) ([48d6da9](https://github.com/mongodb/node-mongodb-native/commit/48d6da99b7990b03df5043a879db3dece5615ad8))
* **NODE-3468:** remove generic overrides from find ([#2935](https://github.com/mongodb/node-mongodb-native/issues/2935)) ([74bd7bd](https://github.com/mongodb/node-mongodb-native/commit/74bd7bdd7a9d02c81cafec1237cb477192778cd8))
* **NODE-3511:** deprecate fullResponse and remove associated buggy code paths ([#2943](https://github.com/mongodb/node-mongodb-native/issues/2943)) ([dfc39d1](https://github.com/mongodb/node-mongodb-native/commit/dfc39d175b03b6f34568f92ffd0107b829015c7d))
* **NODE-3528:** add support for snappy 7 ([#2939](https://github.com/mongodb/node-mongodb-native/issues/2939)) ([0f7f300](https://github.com/mongodb/node-mongodb-native/commit/0f7f3003b948d230edf1491fab775e7acc29381e))
* **NODE-3546:** revert findOne not found result type to null ([#2945](https://github.com/mongodb/node-mongodb-native/issues/2945)) ([1c576e9](https://github.com/mongodb/node-mongodb-native/commit/1c576e9ff525a177ae886cf51e7b52e2e6a56676))

## [4.1.0](https://github.com/mongodb/node-mongodb-native/compare/v4.0.1...v4.1.0) (2021-08-03)


### Features

* **NODE-2843:** implement sessions advanceClusterTime method ([#2920](https://github.com/mongodb/node-mongodb-native/issues/2920)) ([1fd0244](https://github.com/mongodb/node-mongodb-native/commit/1fd0244d77a304460948666b8dedcd62901808b3))
* **NODE-3011:** Load Balancer Support ([#2909](https://github.com/mongodb/node-mongodb-native/issues/2909)) ([c554a7a](https://github.com/mongodb/node-mongodb-native/commit/c554a7a0d132437078a4c9d5e9ed828cce982455))


### Bug Fixes

* **NODE-2883:** Aggregate Operation should not require parent parameter ([#2918](https://github.com/mongodb/node-mongodb-native/issues/2918)) ([dc6e2d6](https://github.com/mongodb/node-mongodb-native/commit/dc6e2d6c5762ec62d1096a52d670b76b02aa2bf3))
* **NODE-3058:** accept null or undefined anywhere we permit nullish values ([#2921](https://github.com/mongodb/node-mongodb-native/issues/2921)) ([b42a1b4](https://github.com/mongodb/node-mongodb-native/commit/b42a1b417e8a4e222000336b0fe9e94053d30d98))
* **NODE-3441:** fix typings for createIndexes ([#2915](https://github.com/mongodb/node-mongodb-native/issues/2915)) ([f87f376](https://github.com/mongodb/node-mongodb-native/commit/f87f37662f4a90f762cc2133d109794dd79e9da8))
* **NODE-3442:** AsyncIterator has incorrect return type ([#2916](https://github.com/mongodb/node-mongodb-native/issues/2916)) ([4a10389](https://github.com/mongodb/node-mongodb-native/commit/4a103890d3db68328163a152e37dbcd2a416e97b))
* **NODE-3452:** readonly filters not permitted by typings ([#2927](https://github.com/mongodb/node-mongodb-native/issues/2927)) ([ce51e78](https://github.com/mongodb/node-mongodb-native/commit/ce51e784c25e6342dc2fb711b647ccc2c8cc4a92))
* **NODE-3510:** omit incorrect `| void` in declaration of Promise overload of `rename()` ([#2922](https://github.com/mongodb/node-mongodb-native/issues/2922)) ([58c1e84](https://github.com/mongodb/node-mongodb-native/commit/58c1e846482575a90d23a39e35711fa1a51e3c33))
* **NODE-3513:** default command monitoring to off ([#2926](https://github.com/mongodb/node-mongodb-native/issues/2926)) ([3c60245](https://github.com/mongodb/node-mongodb-native/commit/3c60245a65e45ce2b944cbd70daafb4c1a44ab81))

### [4.0.1](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0...v4.0.1) (2021-07-20)


### Features

* **NODE-3419:** define MongoRuntimeError children ([#2893](https://github.com/mongodb/node-mongodb-native/issues/2893)) ([eadeb01](https://github.com/mongodb/node-mongodb-native/commit/eadeb01ec689c72032a9c21e3e8486001a026945))


### Bug Fixes

* **NODE-3199:** unable to bundle driver due to uncaught require ([#2904](https://github.com/mongodb/node-mongodb-native/issues/2904)) ([9e48bbd](https://github.com/mongodb/node-mongodb-native/commit/9e48bbdc95149ca62fa21404624125b87c3c9d56))
* **NODE-3393:** snapshot time not applied if distinct executed first ([#2908](https://github.com/mongodb/node-mongodb-native/issues/2908)) ([7aa3008](https://github.com/mongodb/node-mongodb-native/commit/7aa3008d58b9d9869c2ea4af7809fa6b5cfbf6f4))
* **NODE-3417:** allow calling `db()` before MongoClient is connected ([#2889](https://github.com/mongodb/node-mongodb-native/issues/2889)) ([51ea86d](https://github.com/mongodb/node-mongodb-native/commit/51ea86d0abfbe18a3ae0a5e41a6b8c5b974f3c3b))

## [4.0.0](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.6...v4.0.0) (2021-07-13)


### Features

* **NODE-3095:** add timeseries options to db.createCollection ([#2878](https://github.com/mongodb/node-mongodb-native/issues/2878)) ([c145c91](https://github.com/mongodb/node-mongodb-native/commit/c145c91dfa060d819406a599e21d573782291ad4))
* **NODE-3392:** enable snapshot reads on secondaries ([#2897](https://github.com/mongodb/node-mongodb-native/issues/2897)) ([523e05c](https://github.com/mongodb/node-mongodb-native/commit/523e05c3684dcf98c8bbfa4f0631092debd8a85c))
* **NODE-3403:** define MongoRuntimeError children ([#2894](https://github.com/mongodb/node-mongodb-native/issues/2894)) ([cb0db49](https://github.com/mongodb/node-mongodb-native/commit/cb0db494859db6d8f62152cf4bac5e256b9bc650))
* **NODE-3410:** added MongoRuntimeError ([#2892](https://github.com/mongodb/node-mongodb-native/issues/2892)) ([ee903cb](https://github.com/mongodb/node-mongodb-native/commit/ee903cb79f341c6052f058f48a61b6ed2e566f50))


### Bug Fixes

* **NODE-1797:** error when ChangeStream used as iterator and emitter concurrently ([#2871](https://github.com/mongodb/node-mongodb-native/issues/2871)) ([e0b3afe](https://github.com/mongodb/node-mongodb-native/commit/e0b3afe8d2849a0e362a067e25f693d6a4353a12))
* **NODE-1843:** bulk operations ignoring provided sessions ([#2868](https://github.com/mongodb/node-mongodb-native/issues/2868)) ([70810d1](https://github.com/mongodb/node-mongodb-native/commit/70810d191c625447eb2d5324f627c36009a762a7))
* **NODE-3063:** fix custom csfle test script ([#2884](https://github.com/mongodb/node-mongodb-native/issues/2884)) ([d73c80c](https://github.com/mongodb/node-mongodb-native/commit/d73c80c3c69a8cd69af506e747eb54f98b76fe92))
* **NODE-3279:** use "hello" for monitoring if supported ([#2895](https://github.com/mongodb/node-mongodb-native/issues/2895)) ([5a8842a](https://github.com/mongodb/node-mongodb-native/commit/5a8842ad9de2ce6a89ecba985ff6a2a005205afc))
* **NODE-3386:** listCollections result type definition ([#2866](https://github.com/mongodb/node-mongodb-native/issues/2866)) ([c12979a](https://github.com/mongodb/node-mongodb-native/commit/c12979a9c0c1615a3808db41bac64a19449d42d4))
* **NODE-3413:** accept tls=false in mongodb+srv connection strings ([#2886](https://github.com/mongodb/node-mongodb-native/issues/2886)) ([526c73f](https://github.com/mongodb/node-mongodb-native/commit/526c73f3bab5fae734f4870668083b253378a10a))
* **NODE-3416:** make change stream generic default to Document ([#2882](https://github.com/mongodb/node-mongodb-native/issues/2882)) ([3d490dc](https://github.com/mongodb/node-mongodb-native/commit/3d490dcf854a18bb94a9bd94e9a72d155ea414f4))
* **NODE-3430:** watch method types on MongoClient and Db ([#2900](https://github.com/mongodb/node-mongodb-native/issues/2900)) ([17cc291](https://github.com/mongodb/node-mongodb-native/commit/17cc2918767acd41eaec8b602d82fc0a909e5950))

## [4.0.0-beta.6](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.5...v4.0.0-beta.6) (2021-07-01)


### ⚠ BREAKING CHANGES

* **NODE-3291:** Standardize error representation in the driver (#2824)
* **NODE-3272:** emit correct event type when SRV Polling (#2825)
* remove strict/callback mode from Db.collection helper (#2817)

### Features

* **NODE-2751:** add arrayFilters builder to bulk FindOperators ([#2820](https://github.com/mongodb/node-mongodb-native/issues/2820)) ([d099622](https://github.com/mongodb/node-mongodb-native/commit/d099622cdd1ba60d108b1b6a1b323dff847f99b5))
* **NODE-3274:** add type hinting for UpdateFilter ([#2842](https://github.com/mongodb/node-mongodb-native/issues/2842)) ([05035eb](https://github.com/mongodb/node-mongodb-native/commit/05035eb2d7bdb0820181de5f86f0004cc77c1c00))
* **NODE-3325:** support 'let' option for aggregate command ([#2828](https://github.com/mongodb/node-mongodb-native/issues/2828)) ([e38838e](https://github.com/mongodb/node-mongodb-native/commit/e38838e28d075126c8702de18247230d05965e11))
* **NODE-3331:** offer downleveled types for legacy typescript versions ([#2859](https://github.com/mongodb/node-mongodb-native/issues/2859)) ([27cf1d2](https://github.com/mongodb/node-mongodb-native/commit/27cf1d241549c06fb69aee313176d87dcd13514a))
* **NODE-3333:** support 'let' option for CRUD commands ([#2829](https://github.com/mongodb/node-mongodb-native/issues/2829)) ([0d91da1](https://github.com/mongodb/node-mongodb-native/commit/0d91da1b1388e6946ec991fee82f92647a199ece))


### Bug Fixes

* **NODE-1502:** command monitoring objects hold internal state references ([#2832](https://github.com/mongodb/node-mongodb-native/issues/2832)) ([a2887db](https://github.com/mongodb/node-mongodb-native/commit/a2887dbcc191a5779c5f5858a907ccae9095c901))
* **NODE-2026:** SERVICE_REALM kerberos mechanism property not attached ([#2865](https://github.com/mongodb/node-mongodb-native/issues/2865)) ([5caa354](https://github.com/mongodb/node-mongodb-native/commit/5caa354b244e514a956b789662ee67c1d7b50eda))
* **NODE-2035:** exceptions thrown from awaited cursor forEach do not propagate ([#2835](https://github.com/mongodb/node-mongodb-native/issues/2835)) ([ac49df6](https://github.com/mongodb/node-mongodb-native/commit/ac49df6214f58df496118a6a04277ca22c7bef43))
* **NODE-2905:** support SERVICE_NAME authentication mechanism property ([#2857](https://github.com/mongodb/node-mongodb-native/issues/2857)) ([dfb91b8](https://github.com/mongodb/node-mongodb-native/commit/dfb91b8f5bd2b985caa484be96c1116e762ec5ee))
* **NODE-2944:** Reintroduce bson-ext support ([#2823](https://github.com/mongodb/node-mongodb-native/issues/2823)) ([8eb0081](https://github.com/mongodb/node-mongodb-native/commit/8eb0081815bd27031a5390c6ed560347f31db3e7))
* **NODE-3150:** allow retrieving PCRE-style RegExp ([ca9e2dc](https://github.com/mongodb/node-mongodb-native/commit/ca9e2dc3b6e8da6ff7dd8533fabe2ce4036f37f4))
* **NODE-3272:** emit correct event type when SRV Polling ([#2825](https://github.com/mongodb/node-mongodb-native/issues/2825)) ([579119f](https://github.com/mongodb/node-mongodb-native/commit/579119f04ad86ff78f78ea1facb9d9eb733af3cd))
* **NODE-3305:** beforeHandshake flag is always true ([#2854](https://github.com/mongodb/node-mongodb-native/issues/2854)) ([079bd6c](https://github.com/mongodb/node-mongodb-native/commit/079bd6cdc58f7ac11ba3af781776ad95361a7aaf))
* **NODE-3311:** InsertOneOptions extends CommandOperationOptions ([#2816](https://github.com/mongodb/node-mongodb-native/issues/2816)) ([734b481](https://github.com/mongodb/node-mongodb-native/commit/734b481bb13091b45320f4ef77ca3d0d2442e771))
* **NODE-3335:** do not validate explain verbosity in client ([#2834](https://github.com/mongodb/node-mongodb-native/issues/2834)) ([1a57ba8](https://github.com/mongodb/node-mongodb-native/commit/1a57ba87b5f204ed714a9505ee4a36ed82880d7d))
* **NODE-3343:** allow overriding result document after projection applied ([#2856](https://github.com/mongodb/node-mongodb-native/issues/2856)) ([988f9c8](https://github.com/mongodb/node-mongodb-native/commit/988f9c80ba1e622e980ba3649e421b83e3872f77))
* **NODE-3356:** update redaction logic for command monitoring events ([#2849](https://github.com/mongodb/node-mongodb-native/issues/2849)) ([536e5ff](https://github.com/mongodb/node-mongodb-native/commit/536e5ffbc941e8b99ad1c12c5239a688162a494e))


* **NODE-3291:** Standardize error representation in the driver ([#2824](https://github.com/mongodb/node-mongodb-native/issues/2824)) ([9608c6a](https://github.com/mongodb/node-mongodb-native/commit/9608c6a46cea0ec536debd47492fe4007391d6fa))
* remove strict/callback mode from Db.collection helper ([#2817](https://github.com/mongodb/node-mongodb-native/issues/2817)) ([53abfe7](https://github.com/mongodb/node-mongodb-native/commit/53abfe74652a1aff2a27606df4cb179e42ee00fa))

## [4.0.0-beta.5](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.4...v4.0.0-beta.5) (2021-05-26)


### Bug Fixes

* **NODE-3183,NODE-3249:** bring versioned API impl up to date ([#2814](https://github.com/mongodb/node-mongodb-native/issues/2814)) ([cd3b73a](https://github.com/mongodb/node-mongodb-native/commit/cd3b73a5c734a7a16a21af50a3a1cc1bc54da438))
* **NODE-3245:** mark symbols as internal remove from type definitions ([#2810](https://github.com/mongodb/node-mongodb-native/issues/2810)) ([0b636ba](https://github.com/mongodb/node-mongodb-native/commit/0b636ba2148e486b0093850c6e0706d358723f44))
* **NODE-3275:** Fix enum type export naming and serverApi validation ([#2809](https://github.com/mongodb/node-mongodb-native/issues/2809)) ([661511d](https://github.com/mongodb/node-mongodb-native/commit/661511d1fc3bff5785e5f9c7d70ab21789a395b4))

## [4.0.0-beta.4](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.3...v4.0.0-beta.4) (2021-05-18)


### ⚠ BREAKING CHANGES

* **NODE-1812:** replace returnOriginal with returnDocument option (#2803)
* **NODE-3157:** update find and modify interfaces for 4.0 (#2799)
* **NODE-2978:** remove deprecated bulk ops (#2794)

### Features

* **NODE-3115:** Add generic parameterization ([#2767](https://github.com/mongodb/node-mongodb-native/issues/2767)) ([4d12491](https://github.com/mongodb/node-mongodb-native/commit/4d12491a7ef12488bc9b4f0c5b8428d29d687132))
* **NODE-3132:** Add TypedEventEmitter ([#2785](https://github.com/mongodb/node-mongodb-native/issues/2785)) ([f4d40a4](https://github.com/mongodb/node-mongodb-native/commit/f4d40a4c2bf1ace188e624f5c7d5852d5395e00a))


### Bug Fixes

* **NODE-2995:** Add shared metadata MongoClient ([#2772](https://github.com/mongodb/node-mongodb-native/issues/2772)) ([9073d54](https://github.com/mongodb/node-mongodb-native/commit/9073d54b7c924e48aa8c9b96503b4caf5370cdbe))
* **NODE-3074:** update estimated document count for v1 api ([#2764](https://github.com/mongodb/node-mongodb-native/issues/2764)) ([146791c](https://github.com/mongodb/node-mongodb-native/commit/146791c86ff33e63d87d07076ec55598e8ad59e0))
* **NODE-3109:** prevent servername from being an IP ([#2771](https://github.com/mongodb/node-mongodb-native/issues/2771)) ([27089be](https://github.com/mongodb/node-mongodb-native/commit/27089be7e1d2878b19f26ae3dbcf5307c690aa09))
* **NODE-3166:** allowInvalidHostnames and allowInvalidCertificates flags are ignored ([#2784](https://github.com/mongodb/node-mongodb-native/issues/2784)) ([a769cf8](https://github.com/mongodb/node-mongodb-native/commit/a769cf810dab18ce17b4bc58d3a182383c72ee8d))
* **NODE-3174:** Preserve sort key order for numeric string keys ([#2788](https://github.com/mongodb/node-mongodb-native/issues/2788)) ([440de41](https://github.com/mongodb/node-mongodb-native/commit/440de4112d41776671e0dd36b25169fe88dc0a1f))
* **NODE-3176:** handle errors from MessageStream ([#2780](https://github.com/mongodb/node-mongodb-native/issues/2780)) ([76b110e](https://github.com/mongodb/node-mongodb-native/commit/76b110ee4613e41183ce849980ba473a388c3e36))
* **NODE-3194:** Ignore undefined and null options in MongoClient constructor ([#2800](https://github.com/mongodb/node-mongodb-native/issues/2800)) ([8bb92f9](https://github.com/mongodb/node-mongodb-native/commit/8bb92f971f84eae7cedaa380be4bef34896f5c40))
* **NODE-3197:** revert setImmediate in waitQueue ([#2802](https://github.com/mongodb/node-mongodb-native/issues/2802)) ([6c0dfef](https://github.com/mongodb/node-mongodb-native/commit/6c0dfef8e027feb1b1b263da32dc6f61e13c692d))
* **NODE-3206:** Make distinct use any[] type instead of Document[] ([#2795](https://github.com/mongodb/node-mongodb-native/issues/2795)) ([b45e3b3](https://github.com/mongodb/node-mongodb-native/commit/b45e3b324acd1acb2e785c091f4a608bf2e561a8))
* **sdam:** topology no longer causes close event ([#2792](https://github.com/mongodb/node-mongodb-native/issues/2792)) ([6cd982f](https://github.com/mongodb/node-mongodb-native/commit/6cd982f5be9a6e07faf9be426927068342951ab4))


* **NODE-1812:** replace returnOriginal with returnDocument option ([#2803](https://github.com/mongodb/node-mongodb-native/issues/2803)) ([1cdc8a8](https://github.com/mongodb/node-mongodb-native/commit/1cdc8a8738d8c2425e0ff76751331636894256b8))
* **NODE-2978:** remove deprecated bulk ops ([#2794](https://github.com/mongodb/node-mongodb-native/issues/2794)) ([c3a1839](https://github.com/mongodb/node-mongodb-native/commit/c3a183938289c32a067486db0df79259a18d0bb9))
* **NODE-3157:** update find and modify interfaces for 4.0 ([#2799](https://github.com/mongodb/node-mongodb-native/issues/2799)) ([29512da](https://github.com/mongodb/node-mongodb-native/commit/29512daee9854bb9fa1ff7f220b850ce67ffa36a))

## [4.0.0-beta.3](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.2...v4.0.0-beta.3) (2021-04-06)


### Features

* add fermium to evergreen test runs ([#2762](https://github.com/mongodb/node-mongodb-native/issues/2762)) ([2303b41](https://github.com/mongodb/node-mongodb-native/commit/2303b418b461b3c965f0c48f160d812153eba11e))
* versioned api ([#2736](https://github.com/mongodb/node-mongodb-native/issues/2736)) ([93f3ea5](https://github.com/mongodb/node-mongodb-native/commit/93f3ea5815bbd85b90745716f35849a59e8f8746))


### Bug Fixes

* always close gridfs upload stream on finish ([#2759](https://github.com/mongodb/node-mongodb-native/issues/2759)) ([1c6f544](https://github.com/mongodb/node-mongodb-native/commit/1c6f54499402cff5ac0108d3fd3f3f18297c74bd))
* don't auto destroy read stream for Node 14 ([d4e297e](https://github.com/mongodb/node-mongodb-native/commit/d4e297e183213a1d1d533c266a537ab2a62aa477))
* move session support check to operation layer ([#2750](https://github.com/mongodb/node-mongodb-native/issues/2750)) ([c19f296](https://github.com/mongodb/node-mongodb-native/commit/c19f29617e243426268c9d62fc1380c6ea49e56a))
* remove existing session from cloned cursors ([30ccd86](https://github.com/mongodb/node-mongodb-native/commit/30ccd86f41e65991b04a4ce1000762ae9de8d6d1))
* **NODE-3071:** Ignore error message if error code is defined ([#2770](https://github.com/mongodb/node-mongodb-native/issues/2770)) ([d4cc936](https://github.com/mongodb/node-mongodb-native/commit/d4cc9367f411fd803ad82975b52f9444862ff715))
* **NODE-3152:** ensure AWS environment variables are applied properly ([#2756](https://github.com/mongodb/node-mongodb-native/issues/2756)) ([341a602](https://github.com/mongodb/node-mongodb-native/commit/341a60260a4b47271580a6b37d67075f5074cc8d))

## [4.0.0-beta.2](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.1...v4.0.0-beta.2) (2021-03-16)


### ⚠ BREAKING CHANGES

* remove deprecated items (#2740)
* remove enums in favor of const objects (#2741)

### Bug Fixes

* add FLE AWS sessionToken TypeScript definitions ([#2737](https://github.com/mongodb/node-mongodb-native/issues/2737)) ([f4698b5](https://github.com/mongodb/node-mongodb-native/commit/f4698b540add23a71ecfb31bd1f6694a0c49beed))
* remove catch for synchronous socket errors and remove validation on nodejs option ([#2746](https://github.com/mongodb/node-mongodb-native/issues/2746)) ([a516903](https://github.com/mongodb/node-mongodb-native/commit/a516903bf91e34bb83a3bf565c2a39cdbfddd072))
* session support detection spec compliance [PORT: 4.0] ([#2733](https://github.com/mongodb/node-mongodb-native/issues/2733)) ([1615be0](https://github.com/mongodb/node-mongodb-native/commit/1615be0dfcc2af570606aa27cd2d1b40219a389e))


* remove deprecated items ([#2740](https://github.com/mongodb/node-mongodb-native/issues/2740)) ([ee1a4d3](https://github.com/mongodb/node-mongodb-native/commit/ee1a4d32ac95b7d143b08896bc486cfa8c2895a1))
* remove enums in favor of const objects ([#2741](https://github.com/mongodb/node-mongodb-native/issues/2741)) ([d52c00e](https://github.com/mongodb/node-mongodb-native/commit/d52c00ee2a7da10f2369717eeb01a113a67dc57b))

## [4.0.0-beta.1](https://github.com/mongodb/node-mongodb-native/compare/v4.0.0-beta.0...v4.0.0-beta.1) (2021-02-02)


### Bug Fixes

* **find:** correctly translate timeout option into noCursorTimeout ([#2708](https://github.com/mongodb/node-mongodb-native/issues/2708)) ([16a22c4](https://github.com/mongodb/node-mongodb-native/commit/16a22c4688bd1b4fba83fe54ea4eb24b7778eb86))
* Compatibility with mongodb-client-encryption ([#2713](https://github.com/mongodb/node-mongodb-native/issues/2713)) ([d08ddb9](https://github.com/mongodb/node-mongodb-native/commit/d08ddb95984606c681b781052827e40ccdc8ef3d))
* restore `createAutoEncrypter()` functionality ([#2710](https://github.com/mongodb/node-mongodb-native/issues/2710)) ([25ef870](https://github.com/mongodb/node-mongodb-native/commit/25ef87026bca935b00d30ad943ddd28784f801e8))
* Support bson property on Topology class ([#2721](https://github.com/mongodb/node-mongodb-native/issues/2721)) ([00b1374](https://github.com/mongodb/node-mongodb-native/commit/00b1374454f5614879a5ecec5b4aae871e31222c))
* Use getters to sync BulkWriteResult wrappers ([#2716](https://github.com/mongodb/node-mongodb-native/issues/2716)) ([c94b54a](https://github.com/mongodb/node-mongodb-native/commit/c94b54ad35dfe65d45f730f9e78169d169608a34))
* **operations:** avoid hardcoding `checkKeys` for insert operations ([#2726](https://github.com/mongodb/node-mongodb-native/issues/2726)) ([5ce9b25](https://github.com/mongodb/node-mongodb-native/commit/5ce9b25c965e2be633bf4095647e73a152d9914c))
* **operations:** make every CollationOptions property optional except `locale` ([#2727](https://github.com/mongodb/node-mongodb-native/issues/2727)) ([8a678e9](https://github.com/mongodb/node-mongodb-native/commit/8a678e9f1d323700773ab2530a137f0346036dce))
* **WriteConcern:** avoid throwing error when options is null ([#2714](https://github.com/mongodb/node-mongodb-native/issues/2714)) ([ea142bc](https://github.com/mongodb/node-mongodb-native/commit/ea142bc78ce9f6b2b97fd8998734d3d698aa2f38))

## [4.0.0-beta.0](https://github.com/mongodb/node-mongodb-native/compare/v3.5.4...v4.0.0-beta.0) (2021-01-19)


### ⚠ BREAKING CHANGES

* Clarify empty BulkOperation error message (#2697)
* **db:** suppress Db events (#2251)
* Integrate MongoOptions parser into driver (#2680)
* **bulk:** add collation to FindOperators (#2679)
* remove top-level write concern options (#2642)
* CreateIndexOp returns string, CreateIndexesOp returns array (#2666)
* conform CRUD result types to specification (#2651)
* remove deprecated Collection.group helper
* Options object precedence over URI options (#2691)
* adds async iterator for custom promises
* format sort in cursor and in sort builder (#2573)
* remove Cursor#transformStream
* remove deprecated find options
* pull CursorStream out of Cursor
* remove deprecated GridFS API
* only store topology on MongoClient  (#2594)

### Features

* add `withReadConcern` builder to AbstractCursor ([#2645](https://github.com/mongodb/node-mongodb-native/issues/2645)) ([0cca729](https://github.com/mongodb/node-mongodb-native/commit/0cca729eb94ee942b775e14d57c44d57beda3fce))
* add an internal `tryNext` method ([#2638](https://github.com/mongodb/node-mongodb-native/issues/2638)) ([43c94b6](https://github.com/mongodb/node-mongodb-native/commit/43c94b6d40824c6cfa531d6ee9ac6b307e4cbcc6))
* add commitQuorum option to createIndexes command ([168a952](https://github.com/mongodb/node-mongodb-native/commit/168a952f60787f325b202c539a664b9e14451b65))
* add explain support for cursor commands  ([#2622](https://github.com/mongodb/node-mongodb-native/issues/2622)) ([bb1e081](https://github.com/mongodb/node-mongodb-native/commit/bb1e081e366612e0872d3c5ec0fadbb61e202ad6))
* add explain support for non-cursor commands ([#2599](https://github.com/mongodb/node-mongodb-native/issues/2599)) ([4472308](https://github.com/mongodb/node-mongodb-native/commit/447230826cd764e2b766d3178d4fa369f8a4ebc4))
* add MONGODB-AWS as a supported auth mechanism ([7f3cfba](https://github.com/mongodb/node-mongodb-native/commit/7f3cfbac15f537aa2ca9da145063f10c61390406))
* Add MongoOption builder logic ([#2623](https://github.com/mongodb/node-mongodb-native/issues/2623)) ([cb9ee9e](https://github.com/mongodb/node-mongodb-native/commit/cb9ee9e6175a6654c3c300801884e4a3c3a653ac))
* Add MongoOptions interface ([#2616](https://github.com/mongodb/node-mongodb-native/issues/2616)) ([54c456b](https://github.com/mongodb/node-mongodb-native/commit/54c456b4a4ff51c4f6734cff550d8aa53a47db15))
* add types for the result of bulk initialize methods ([#2654](https://github.com/mongodb/node-mongodb-native/issues/2654)) ([3e5ff57](https://github.com/mongodb/node-mongodb-native/commit/3e5ff57d6438add80c1bad932114f3d086f1cc29))
* adds "hidden" option when creating indexes ([ee8ca1a](https://github.com/mongodb/node-mongodb-native/commit/ee8ca1aaddd1da33689a49c99dcc1c6f42b6f9dd))
* adds async iterator for custom promises ([16d6572](https://github.com/mongodb/node-mongodb-native/commit/16d65722a5b2318eee014511c94385e9d4f60ed7))
* allow hinting the delete command ([95fedf4](https://github.com/mongodb/node-mongodb-native/commit/95fedf4ecf2da73802a4146ab0c7df6a0850103c))
* bump wire protocol version for 4.4 ([6d3f313](https://github.com/mongodb/node-mongodb-native/commit/6d3f313a9defd12489b621896439b3f9ec8cb1ae))
* convert the entire codebase to TypeScript ([272bc18](https://github.com/mongodb/node-mongodb-native/commit/272bc18f51351a9f18d6d1bc68413c1a0c1f649f))
* deprecate `oplogReplay` for find commands ([24155e7](https://github.com/mongodb/node-mongodb-native/commit/24155e7905422460afc7e6abb120c596f40712c1))
* directConnection adds unify behavior for replica set discovery ([#2349](https://github.com/mongodb/node-mongodb-native/issues/2349)) ([34c9195](https://github.com/mongodb/node-mongodb-native/commit/34c9195251adeeb1c9e8bc4234c8afb076d1d60e))
* expand use of error labels for retryable writes ([c775a4a](https://github.com/mongodb/node-mongodb-native/commit/c775a4a1c53b8476eff6c9759b5647c9cbfa4e04))
* implements promise provider ([e5b762c](https://github.com/mongodb/node-mongodb-native/commit/e5b762c6d53afa967f24c26a1d1b6c921757c9c9))
* Integrate MongoOptions parser into driver ([#2680](https://github.com/mongodb/node-mongodb-native/issues/2680)) ([b1bdb06](https://github.com/mongodb/node-mongodb-native/commit/b1bdb06cbe95fd320afff00ccb8fea666c79b444))
* introduce AbstractCursor and its concrete subclasses ([#2619](https://github.com/mongodb/node-mongodb-native/issues/2619)) ([a2d78b2](https://github.com/mongodb/node-mongodb-native/commit/a2d78b22b28ae649fa2c4e28294a3a03c446373e))
* introduce an interruptable async interval timer ([21cbabd](https://github.com/mongodb/node-mongodb-native/commit/21cbabdb1cf9ebee887bda547aa9116781cf03ae))
* introduce BufferPool to replace BufferList ([#2669](https://github.com/mongodb/node-mongodb-native/issues/2669)) ([3c56efc](https://github.com/mongodb/node-mongodb-native/commit/3c56efcf25a9ca8085a37f2ebac8cb3bff6d6d6c))
* introduce typescript migration pipeline ([f40cffc](https://github.com/mongodb/node-mongodb-native/commit/f40cffc6ccec032c7266a33b5e53728d9ae11294))
* Options object precedence over URI options ([#2691](https://github.com/mongodb/node-mongodb-native/issues/2691)) ([85d8d09](https://github.com/mongodb/node-mongodb-native/commit/85d8d09713e2a80442dfbb38ecc887204306ba17))
* reintroduce clone and rewind for cursors ([#2647](https://github.com/mongodb/node-mongodb-native/issues/2647)) ([a5154fb](https://github.com/mongodb/node-mongodb-native/commit/a5154fb5977dddd88e57f9d20965e95fa7ddb80b))
* remove `parallelCollectionScan` helper ([9dee21f](https://github.com/mongodb/node-mongodb-native/commit/9dee21feefab9a8f20e289e6ff7abece40ef7d0b))
* remove Cursor#transformStream ([a54be7a](https://github.com/mongodb/node-mongodb-native/commit/a54be7afd665d92337a8ba2e206cc3e6ce5e5773))
* remove legacy topology types ([6aa2434](https://github.com/mongodb/node-mongodb-native/commit/6aa2434628e85ead8e5be620c27ebe8ab08a1c05))
* remove reIndex ([6b510a6](https://github.com/mongodb/node-mongodb-native/commit/6b510a689ab0dc44b3302ad21c171e75f9059716))
* remove the collection save method ([d5bb496](https://github.com/mongodb/node-mongodb-native/commit/d5bb49637853c841b47df020807edf9adb5ef804))
* remove top-level write concern options ([#2642](https://github.com/mongodb/node-mongodb-native/issues/2642)) ([6914e87](https://github.com/mongodb/node-mongodb-native/commit/6914e875b37fb0ad444105ad24839d50c5c224d4))
* support `allowDiskUse` for find commands ([dbc0b37](https://github.com/mongodb/node-mongodb-native/commit/dbc0b3722516a128c253bf85366a3432756ff92a))
* support creating collections and indexes in transactions ([917f2b0](https://github.com/mongodb/node-mongodb-native/commit/917f2b088f22f4c6ed803f0349859d057389ac1e))
* **bulk:** add collation to FindOperators ([#2679](https://github.com/mongodb/node-mongodb-native/issues/2679)) ([a41d503](https://github.com/mongodb/node-mongodb-native/commit/a41d503ebd061977e712ac26dc7c757ab03cab14))
* support hedged reads ([2b7b936](https://github.com/mongodb/node-mongodb-native/commit/2b7b936b532c1461dba59a4840978beea7b934fb))
* support passing a hint to findOneAndReplace/findOneAndUpdate ([faee15b](https://github.com/mongodb/node-mongodb-native/commit/faee15b686b895b84fd0b52c1e69e0caec769732))
* support shorter SCRAM conversations ([6b9ff05](https://github.com/mongodb/node-mongodb-native/commit/6b9ff0561d14818bf07f4946ade04fc54683d0b9))
* **db:** remove createCollection strict mode ([bb13764](https://github.com/mongodb/node-mongodb-native/commit/bb137643b2a95bd5898d2fef4d761de5f2e2cde0))
* **FindCursor:** fluent builder for allowDiskUse option ([#2678](https://github.com/mongodb/node-mongodb-native/issues/2678)) ([d442aac](https://github.com/mongodb/node-mongodb-native/commit/d442aac66e7a236decdfbeb5be0cc8a163486534))
* **geoHaystackSearch:** remove geoHaystackSearch ([5a1b61c](https://github.com/mongodb/node-mongodb-native/commit/5a1b61c9f2baf8f6f3cec4c34ce2db52272cd49d))
* support speculative authentication in scram-sha and x509 ([f71f09b](https://github.com/mongodb/node-mongodb-native/commit/f71f09bd466f0630bbe6859d8ed074ecd5f4a51f))
* support the streaming protocol for topology updates ([7e9c5bc](https://github.com/mongodb/node-mongodb-native/commit/7e9c5bc5e8b10ae146d80535a44221ddb9ded069))
* use error labels for retryable writes in legacy topologies ([fefc165](https://github.com/mongodb/node-mongodb-native/commit/fefc1651a885ec28758271c9e3c36104b05bdb75))


### Bug Fixes

* add all accessor tags to exported symbols ([#2649](https://github.com/mongodb/node-mongodb-native/issues/2649)) ([55534c9](https://github.com/mongodb/node-mongodb-native/commit/55534c9c6734e44e944f762421754df88e42b6a1))
* allow client connect after close ([#2581](https://github.com/mongodb/node-mongodb-native/issues/2581)) ([1aecf96](https://github.com/mongodb/node-mongodb-native/commit/1aecf964d79344acea4ff4387d2faf51b78cfe78))
* allow client re-connect after close ([#2615](https://github.com/mongodb/node-mongodb-native/issues/2615)) ([9a176ef](https://github.com/mongodb/node-mongodb-native/commit/9a176efbf15bb7f3dc30a4302d1550af6eb910d3))
* allow event loop to process during wait queue processing ([#2541](https://github.com/mongodb/node-mongodb-native/issues/2541)) ([7bbc783](https://github.com/mongodb/node-mongodb-native/commit/7bbc783f83dd86929e030224177b312c2152f814))
* always clear cancelled wait queue members during processing ([7e942ba](https://github.com/mongodb/node-mongodb-native/commit/7e942bacbf6bb69c0072fb59cdcaeced2c046a2e))
* always include `writeErrors` on a `BulkWriteError` instance ([0759a0e](https://github.com/mongodb/node-mongodb-native/commit/0759a0ef08737bf99e02e2e1e2def2e1c9c80185))
* apply bson options for bulk operations ([#2601](https://github.com/mongodb/node-mongodb-native/issues/2601)) ([e01cafd](https://github.com/mongodb/node-mongodb-native/commit/e01cafdd1ab0f3056d86aa6149caf2605e81075a))
* assert update/replace atomic requirements in bulk operations ([911c25d](https://github.com/mongodb/node-mongodb-native/commit/911c25d201fc1d8acd359484d73d4a179fd6c08f))
* awaitable isMaster timeout must respect connectTimeoutMS ([#2650](https://github.com/mongodb/node-mongodb-native/issues/2650)) ([8d44cc2](https://github.com/mongodb/node-mongodb-native/commit/8d44cc232a27d11485706ae4cac7d61e4d37bd09))
* change prepublishOnly npm script to prepare ([95440fb](https://github.com/mongodb/node-mongodb-native/commit/95440fbb3b506e5b30b5c39825e2df0b45dbd011))
* Change socket timeout default to 0 ([#2564](https://github.com/mongodb/node-mongodb-native/issues/2564)) ([7ed6dbf](https://github.com/mongodb/node-mongodb-native/commit/7ed6dbf7d541a10513f3bd93f1c415ed0ced1b83))
* clarify handle wrong set name single topology ([93cd8b3](https://github.com/mongodb/node-mongodb-native/commit/93cd8b3183541fd26b448f78e200c49691451e35))
* connection leak if wait queue member cancelled ([#2563](https://github.com/mongodb/node-mongodb-native/issues/2563)) ([4018a1e](https://github.com/mongodb/node-mongodb-native/commit/4018a1e7acc587ad2f2c6faf2d53c459c73058be))
* correct legacy require paths ([f96a97f](https://github.com/mongodb/node-mongodb-native/commit/f96a97fff9d9d71a289cbe20f72f2a3b17347d72))
* correct typeof check in checkSupportedServer ([#2690](https://github.com/mongodb/node-mongodb-native/issues/2690)) ([421fe6e](https://github.com/mongodb/node-mongodb-native/commit/421fe6e0f856d74a421f11b35ed72a4910811a3f))
* correctly re-establishes pipe destinations ([#2592](https://github.com/mongodb/node-mongodb-native/issues/2592)) ([7d023a6](https://github.com/mongodb/node-mongodb-native/commit/7d023a6eda0fca52d68af6ae4e66c649d04b3c3e))
* correctly use template string for connection string error message ([b4d89ea](https://github.com/mongodb/node-mongodb-native/commit/b4d89eaaca9d374f693cff830411e12191efd1c0))
* createCollection only uses listCollections in strict mode ([ccccbc8](https://github.com/mongodb/node-mongodb-native/commit/ccccbc8c49bce0bd7378fd557a228b86aa7a45e4))
* db.command to not inherit options from parent ([8f6c247](https://github.com/mongodb/node-mongodb-native/commit/8f6c2477f93400abf3606cfe908d209d16d3d4d9))
* don't depend on private node api for `Timeout` wrapper ([e6dc1f4](https://github.com/mongodb/node-mongodb-native/commit/e6dc1f48d62b68ba56b93359d7aa755c08985867))
* don't immediately schedule monitoring after streaming failure ([7a3b99b](https://github.com/mongodb/node-mongodb-native/commit/7a3b99ba5dbffd34282e2d52691011026b0b065a))
* don't reset monitor if we aren't streaming topology changes ([2f23dd7](https://github.com/mongodb/node-mongodb-native/commit/2f23dd7a4fca0c93d7b7432f99273eab8d11b01a))
* don't try to calculate sMax if there are no viable servers ([dd24cee](https://github.com/mongodb/node-mongodb-native/commit/dd24cee5816b66f0a86f0497f1c98921b0006473))
* ensure implicit sessions are ended consistently ([1a443e7](https://github.com/mongodb/node-mongodb-native/commit/1a443e70bfdbee61b72ec23d7ef338ad189b667d))
* enumerate function override call signatures ([#2687](https://github.com/mongodb/node-mongodb-native/issues/2687)) ([2492dd2](https://github.com/mongodb/node-mongodb-native/commit/2492dd2ff7a4f1cc49d74942e94a2a23c3857723))
* error label checking & insertOne where retryWrites is false ([d4502aa](https://github.com/mongodb/node-mongodb-native/commit/d4502aa957129a86f1dea53388697623263c0c59))
* filter servers before applying reducers ([99b86b3](https://github.com/mongodb/node-mongodb-native/commit/99b86b32a032b9b39f9fec07a90095958b977bb0))
* handle session with unacknowledged write ([4aeaedf](https://github.com/mongodb/node-mongodb-native/commit/4aeaedf3b12a196127852522bcc81d8b507676d5))
* hint should raise error on unacknowledged writes ([665b352](https://github.com/mongodb/node-mongodb-native/commit/665b3524080776d836c69351c3db1cb7f211c3dc))
* honor journal=true in connection string ([41d291a](https://github.com/mongodb/node-mongodb-native/commit/41d291abd227650927879f499f4b2d19ae9a651c))
* ignore ENOTFOUND during TXT record lookup ([b1e15a8](https://github.com/mongodb/node-mongodb-native/commit/b1e15a8b038ec9214b977f4653cc8853329e4a41))
* ingest WC as a simple object or number for w value ([#2695](https://github.com/mongodb/node-mongodb-native/issues/2695)) ([f5f9fd4](https://github.com/mongodb/node-mongodb-native/commit/f5f9fd4779f931a425517b24900347cdcf7a2790))
* internal access modifier on symbol properties ([#2664](https://github.com/mongodb/node-mongodb-native/issues/2664)) ([f6d9b81](https://github.com/mongodb/node-mongodb-native/commit/f6d9b81fad98ac48c119c5c022c2d868c7cf968b))
* ipv6 is not supported when using dns service discovery ([3cc53cb](https://github.com/mongodb/node-mongodb-native/commit/3cc53cbf1cefc3590afc2f04df9e4aa32ea1085c))
* make MongoBulkWriteError conform to CRUD spec ([#2621](https://github.com/mongodb/node-mongodb-native/issues/2621)) ([7aa3567](https://github.com/mongodb/node-mongodb-native/commit/7aa3567e651025f4b56f1932d536f94ced642f1d))
* make the owner property of ClientSessionOptions optional ([#2656](https://github.com/mongodb/node-mongodb-native/issues/2656)) ([d811a01](https://github.com/mongodb/node-mongodb-native/commit/d811a01f961b55a55afe5ed73e6e9a477e6f6e35))
* make tryNext and Batch public ([#2675](https://github.com/mongodb/node-mongodb-native/issues/2675)) ([634ae4f](https://github.com/mongodb/node-mongodb-native/commit/634ae4f93013c824bc153f132f0dd6c9bd2cc127))
* min and max take Document parameters, not numbers ([#2657](https://github.com/mongodb/node-mongodb-native/issues/2657)) ([698533f](https://github.com/mongodb/node-mongodb-native/commit/698533f3fe0176a4d361e20e0dfa1c049a1af862))
* move kerberos client setup from prepare to auth ([#2655](https://github.com/mongodb/node-mongodb-native/issues/2655)) ([93ef9e8](https://github.com/mongodb/node-mongodb-native/commit/93ef9e8f36acb8801859bb83933a7196d509b11b))
* npm script check:test failure on ubuntu ([addb4f5](https://github.com/mongodb/node-mongodb-native/commit/addb4f5960da99c900ca496917e93fb7ac789ddf))
* only consider MongoError subclasses for retryability ([265fe40](https://github.com/mongodb/node-mongodb-native/commit/265fe40cf29992764d1ab030a1ee4dca97cd7c7c))
* only force server id generation if requested ([#2653](https://github.com/mongodb/node-mongodb-native/issues/2653)) ([577d6eb](https://github.com/mongodb/node-mongodb-native/commit/577d6eb2387f4ea45964ef4c028dc8535f782a66))
* only use ServerDescription equality to prevent event emission ([ddf151d](https://github.com/mongodb/node-mongodb-native/commit/ddf151da63b1212a433bf73b1fdc6ff0e83182c2))
* pass optional promise lib to maybePromise ([52be01f](https://github.com/mongodb/node-mongodb-native/commit/52be01feabfbfbbd73523086cff1ac7020393456))
* pass options into `commandSupportsReadConcern` ([e855c83](https://github.com/mongodb/node-mongodb-native/commit/e855c83d8b73f4ce57a11193a1e52461ab2cd4db))
* permit waking async interval with unreliable clock ([#2551](https://github.com/mongodb/node-mongodb-native/issues/2551)) ([a2c113f](https://github.com/mongodb/node-mongodb-native/commit/a2c113fbd1f3cf013b7a3caf227a74d69e67a3b1))
* prevent bulk operations from being executed multiple times ([#2658](https://github.com/mongodb/node-mongodb-native/issues/2658)) ([bb883f7](https://github.com/mongodb/node-mongodb-native/commit/bb883f7ea146db7569d1bd8032f42bed4e49d3dd))
* reduce default keepalive time to align with Azure defaults ([ffc0f55](https://github.com/mongodb/node-mongodb-native/commit/ffc0f555241f565ea581a04a6c0111798f61ccce))
* remove check for NonResumableChangeStreamError label ([7cf669d](https://github.com/mongodb/node-mongodb-native/commit/7cf669d378ed87ee4dd20068e24c5dbb3f62bc83))
* remove circular dependency warnings on node 14 ([f32fa15](https://github.com/mongodb/node-mongodb-native/commit/f32fa15ba2b0f8832f3e5dec971173d121390450))
* removed geoNear deprecation ([a3408e6](https://github.com/mongodb/node-mongodb-native/commit/a3408e69616a176e1f7e0879918f76f10ede44a9))
* revert BSON Map export removal ([#2704](https://github.com/mongodb/node-mongodb-native/issues/2704)) ([2b74387](https://github.com/mongodb/node-mongodb-native/commit/2b743876f43f80801e5d54b3ba6fdb4fb97cf4b6))
* SASL signature consists of the string representation of the payload ([#2529](https://github.com/mongodb/node-mongodb-native/issues/2529)) ([e7d2693](https://github.com/mongodb/node-mongodb-native/commit/e7d26930168d134f1626fb044147c2a0b9fb3044))
* single `readPreferenceTags` should be parsed as an array ([98e879d](https://github.com/mongodb/node-mongodb-native/commit/98e879d249e1adca9d23a8a75392b3d6bac5fd98))
* store name of collection for more informative error messages ([979d41e](https://github.com/mongodb/node-mongodb-native/commit/979d41e14f5acf69bac094b3863591ee8e01fd9c))
* support write concern provided as string in `fromOptions` ([637f428](https://github.com/mongodb/node-mongodb-native/commit/637f4288c1edb799267ccbce6d25a49304f6149c))
* tests using lib prohibited ([#2625](https://github.com/mongodb/node-mongodb-native/issues/2625)) ([5e04fff](https://github.com/mongodb/node-mongodb-native/commit/5e04fffa989532e12ff89544bc7231b2d2e1cfb9))
* **ChangeStream:** handle null changes ([9db8369](https://github.com/mongodb/node-mongodb-native/commit/9db8369e5242e57cf516a50e682a444e48c32db7))
* **ChangeStream:** make CursorNotFound error resumable ([3d8ac55](https://github.com/mongodb/node-mongodb-native/commit/3d8ac55a47c9313d3a7e93bbf5584f3759ed94f3))
* **ChangeStream:** should resume from errors when iterating ([7a8a533](https://github.com/mongodb/node-mongodb-native/commit/7a8a5336cf33837c44290bb1ee51d806315e1b09))
* **ChangeStream:** whitelist change stream resumable errors ([f4bf912](https://github.com/mongodb/node-mongodb-native/commit/f4bf9125e9a9e64d03e625580bd7c84d03fa8d09)), closes [#17](https://github.com/mongodb/node-mongodb-native/issues/17) [#18](https://github.com/mongodb/node-mongodb-native/issues/18)
* **ClientSession:** correct toBSON TypeScript signature ([#2686](https://github.com/mongodb/node-mongodb-native/issues/2686)) ([cc4b9e0](https://github.com/mongodb/node-mongodb-native/commit/cc4b9e051e940f0969cd6ea45675a8493ab591d3))
* writes within transactions are not retryable ([08fd347](https://github.com/mongodb/node-mongodb-native/commit/08fd3476885ca9d9c2860f5992f8f0f29a9e0bd2))
* **cursor:** transforms should only be applied once to documents ([a52a860](https://github.com/mongodb/node-mongodb-native/commit/a52a8608b267b2fbd5806c992c2d18355e262ac3))
* throw an error if `allowDiskUse` is used on MongoDB < 3.2 ([ebeae56](https://github.com/mongodb/node-mongodb-native/commit/ebeae5617df7f1d5606c6d41b45130615cfff811))
* typings for readConcern ([4f9d4ce](https://github.com/mongodb/node-mongodb-native/commit/4f9d4ceafdcca01d49e6eeb286a9c27ddf485969))
* unordered bulk write should attempt to execute all batches ([fa07519](https://github.com/mongodb/node-mongodb-native/commit/fa07519bf0b1d2278c0c824e6471c62267c652ef))
* use async interruptable interval for server monitoring ([d792806](https://github.com/mongodb/node-mongodb-native/commit/d792806484308999ea10d091a2634a65eaa4d330))
* **sdam:** use ObjectId comparison to track maxElectionId ([db991d6](https://github.com/mongodb/node-mongodb-native/commit/db991d6916306d1fe08508d4c3e8f7a37d7fd21f))
* use options for readPreference in client ([800e71e](https://github.com/mongodb/node-mongodb-native/commit/800e71e7d7ae0fa8fcfc5e1612a6ee9ce6bc05a1))
* use properly camel cased form of `mapReduce` for command ([c1ed2c1](https://github.com/mongodb/node-mongodb-native/commit/c1ed2c1ce4c6f2d40cd1c7b84ad672a90a09c83b))
* use require instead of readFileSync for driver.version ([#2652](https://github.com/mongodb/node-mongodb-native/issues/2652)) ([e7a42bb](https://github.com/mongodb/node-mongodb-native/commit/e7a42bb4b67d8842e4c5c3f9e946093fd01dd1d3))
* **GridFS:** emit error on bad options ([21b8ae9](https://github.com/mongodb/node-mongodb-native/commit/21b8ae9009ede976e71d1a3e160e4150117e7ad9))
* **GridFS:** emit error on bad options ([e11e573](https://github.com/mongodb/node-mongodb-native/commit/e11e573e30fc6416a51a2622c47075a8a425676a))
* user roles take single string & DDL readPreference tests ([98162c3](https://github.com/mongodb/node-mongodb-native/commit/98162c39b5a7535e2edce54491bd949db72b49fe))
* warning message fix should not check for topology existence ([f7094b2](https://github.com/mongodb/node-mongodb-native/commit/f7094b20ab0adf0dde3486b1ed59df8ee1c68e8a))


* **db:** suppress Db events ([#2251](https://github.com/mongodb/node-mongodb-native/issues/2251)) ([eed1131](https://github.com/mongodb/node-mongodb-native/commit/eed11310fea5c06931fc7b41c62a360ada28734e))
* Clarify empty BulkOperation error message ([#2697](https://github.com/mongodb/node-mongodb-native/issues/2697)) ([34f488d](https://github.com/mongodb/node-mongodb-native/commit/34f488d913a88c9f7498cdb28c039455b03befb1))
* conform CRUD result types to specification ([#2651](https://github.com/mongodb/node-mongodb-native/issues/2651)) ([0135e9e](https://github.com/mongodb/node-mongodb-native/commit/0135e9e5b6660b8e3575791ab206f198375dece2))
* CreateIndexOp returns string, CreateIndexesOp returns array ([#2666](https://github.com/mongodb/node-mongodb-native/issues/2666)) ([e12c485](https://github.com/mongodb/node-mongodb-native/commit/e12c485ebcda7b0d4dfeb145de2df6a9c514577c))
* format sort in cursor and in sort builder ([#2573](https://github.com/mongodb/node-mongodb-native/issues/2573)) ([8aad134](https://github.com/mongodb/node-mongodb-native/commit/8aad13491e26446ba357e44c4e1929da71821845))
* only store topology on MongoClient  ([#2594](https://github.com/mongodb/node-mongodb-native/issues/2594)) ([33fa6b2](https://github.com/mongodb/node-mongodb-native/commit/33fa6b2df76dd878e6acc6d6259e1545542b197d))
* pull CursorStream out of Cursor ([054838f](https://github.com/mongodb/node-mongodb-native/commit/054838f00e75a1ed6e41f320c55d62fb3b63e583))
* remove deprecated Collection.group helper ([cf5c865](https://github.com/mongodb/node-mongodb-native/commit/cf5c865f9e1775c82d0510dcb32aca2e168695c3))
* remove deprecated find options ([0e6375a](https://github.com/mongodb/node-mongodb-native/commit/0e6375a22fc3d1f4ce10846b98dafaa65044ef6d))
* remove deprecated GridFS API ([bee0aa2](https://github.com/mongodb/node-mongodb-native/commit/bee0aa2a2cfeb2e83aca4d4aef433179b373ca23))

<a name="3.5.4"></a>
## [3.5.4](https://github.com/mongodb/node-mongodb-native/compare/v3.5.3...v3.5.4) (2020-02-25)


### Bug Fixes

* **cmap:** don't run min connection thread if no minimum specified ([2d1b713](https://github.com/mongodb/node-mongodb-native/commit/2d1b713))
* **sdam:** use ObjectId comparison to track maxElectionId ([a1e0849](https://github.com/mongodb/node-mongodb-native/commit/a1e0849))
* **topology:** ensure selection wait queue is always processed ([bf701d6](https://github.com/mongodb/node-mongodb-native/commit/bf701d6))
* **topology:** enter `STATE_CLOSING` before draining waitQueue ([494dffb](https://github.com/mongodb/node-mongodb-native/commit/494dffb))
* don't consume first document when calling `hasNext` on cursor ([bb359a1](https://github.com/mongodb/node-mongodb-native/commit/bb359a1))


### Features

* add utility helper for returning promises or using callbacks ([ac9e4c9](https://github.com/mongodb/node-mongodb-native/commit/ac9e4c9))



<a name="3.5.3"></a>
## [3.5.3](https://github.com/mongodb/node-mongodb-native/compare/v3.5.2...v3.5.3) (2020-02-12)


### Bug Fixes

* **message-stream:** support multiple inbound message packets ([8388443](https://github.com/mongodb/node-mongodb-native/commit/8388443))
* **server:** non-timeout network errors transition to Unknown state ([fa4b01b](https://github.com/mongodb/node-mongodb-native/commit/fa4b01b))


### Features

* **connection:** support exhaust behavior at the transport level ([9ccf268](https://github.com/mongodb/node-mongodb-native/commit/9ccf268))



<a name="3.5.2"></a>
## [3.5.2](https://github.com/mongodb/node-mongodb-native/compare/v3.5.1...v3.5.2) (2020-01-20)


### Bug Fixes

* properly handle err messages in MongoDB 2.6 servers ([0f4ab38](https://github.com/mongodb/node-mongodb-native/commit/0f4ab38))
* **topology:** always emit SDAM unrecoverable errors ([57f158f](https://github.com/mongodb/node-mongodb-native/commit/57f158f))



<a name="3.5.1"></a>
## [3.5.1](https://github.com/mongodb/node-mongodb-native/compare/v3.5.0...v3.5.1) (2020-01-17)


### Bug Fixes

* **cmap:** accept all node TLS options as pool options ([5995d1d](https://github.com/mongodb/node-mongodb-native/commit/5995d1d))
* **cmap:** error wait queue members on failed connection creation ([d13b153](https://github.com/mongodb/node-mongodb-native/commit/d13b153))
* **connect:** listen to `secureConnect` for tls connections ([f8bdb8d](https://github.com/mongodb/node-mongodb-native/commit/f8bdb8d))
* **transactions:** use options helper to resolve read preference ([9698a76](https://github.com/mongodb/node-mongodb-native/commit/9698a76))
* **uri_parser:** TLS uri variants imply `ssl=true` ([c8d182e](https://github.com/mongodb/node-mongodb-native/commit/c8d182e))



<a name="3.5.0"></a>
# [3.5.0](https://github.com/mongodb/node-mongodb-native/compare/v3.4.1...v3.5.0) (2020-01-14)


### Bug Fixes

* copy `ssl` option to pool connection options ([563ced6](https://github.com/mongodb/node-mongodb-native/commit/563ced6))
* destroy connections marked as closed on checkIn / checkOut ([2bd17a6](https://github.com/mongodb/node-mongodb-native/commit/2bd17a6))
* ensure sync errors are thrown, and don't callback twice ([cca5b49](https://github.com/mongodb/node-mongodb-native/commit/cca5b49))
* ignore connection errors during pool destruction ([b8805dc](https://github.com/mongodb/node-mongodb-native/commit/b8805dc))
* not all message payloads are arrays of Buffer ([e4df5f4](https://github.com/mongodb/node-mongodb-native/commit/e4df5f4))
* recover on network error during initial connect ([a13dc68](https://github.com/mongodb/node-mongodb-native/commit/a13dc68))
* remove servers with me mismatch in `updateRsFromPrimary` ([95a772e](https://github.com/mongodb/node-mongodb-native/commit/95a772e))
* report the correct platform in client metadata ([35d0274](https://github.com/mongodb/node-mongodb-native/commit/35d0274))
* reschedule monitoring before emitting heartbeat events ([7fcbeb5](https://github.com/mongodb/node-mongodb-native/commit/7fcbeb5))
* socket timeout for handshake should be `connectTimeoutMS` ([c83af9a](https://github.com/mongodb/node-mongodb-native/commit/c83af9a))
* timed out streams should be destroyed on `timeout` event ([5319ff9](https://github.com/mongodb/node-mongodb-native/commit/5319ff9))
* use remote address for stream identifier ([f13c20b](https://github.com/mongodb/node-mongodb-native/commit/f13c20b))
* used weighted RTT calculation for server selection ([d446be5](https://github.com/mongodb/node-mongodb-native/commit/d446be5))
* **execute-operation:** don't swallow synchronous errors ([0a2d4e9](https://github.com/mongodb/node-mongodb-native/commit/0a2d4e9))
* **gridfs:** make a copy of chunk before writing to server ([b4ec5b8](https://github.com/mongodb/node-mongodb-native/commit/b4ec5b8))


### Features

* add a `withConnection` helper to the connection pool ([d59dced](https://github.com/mongodb/node-mongodb-native/commit/d59dced))
* include `connectionId` for APM with new CMAP connection pool ([9bd360c](https://github.com/mongodb/node-mongodb-native/commit/9bd360c))
* integrate CMAP connection pool into unified topology ([9dd3939](https://github.com/mongodb/node-mongodb-native/commit/9dd3939))
* introduce `MongoServerSelectionError` ([0cf7ec9](https://github.com/mongodb/node-mongodb-native/commit/0cf7ec9))
* introduce a class for tracking stream specific attributes ([f6bf82c](https://github.com/mongodb/node-mongodb-native/commit/f6bf82c))
* introduce a new `Monitor` type for server monitoring ([2bfe2a1](https://github.com/mongodb/node-mongodb-native/commit/2bfe2a1))
* relay all CMAP events to MongoClient ([1aea4de](https://github.com/mongodb/node-mongodb-native/commit/1aea4de))
* support socket timeouts on a per-connection level ([93e8ad0](https://github.com/mongodb/node-mongodb-native/commit/93e8ad0))



<a name="3.4.1"></a>
## [3.4.1](https://github.com/mongodb/node-mongodb-native/compare/v3.4.0...v3.4.1) (2019-12-19)


### Bug Fixes

* **bulk:** use original indexes as map for current op index ([20800ac](https://github.com/mongodb/node-mongodb-native/commit/20800ac))
* always check for network errors during SCRAM conversation ([e46a70e](https://github.com/mongodb/node-mongodb-native/commit/e46a70e))



<a name="3.4.0"></a>
# [3.4.0](https://github.com/mongodb/node-mongodb-native/compare/v3.3.5...v3.4.0) (2019-12-10)


### Bug Fixes

* **bulk:** use operation index from input to report operation error ([f713b13](https://github.com/mongodb/node-mongodb-native/commit/f713b13))
* **command:** only add TransientTransactionError label when in a transaction ([478d714](https://github.com/mongodb/node-mongodb-native/commit/478d714))
* **compression:** recalculate opcode after determine OP_COMPRESSED ([022f51b](https://github.com/mongodb/node-mongodb-native/commit/022f51b))
* **connect:** connect with family 0 instead of family 4 ([db07366](https://github.com/mongodb/node-mongodb-native/commit/db07366))
* **connection:** timed out connections should not be half closed ([850f4f5](https://github.com/mongodb/node-mongodb-native/commit/850f4f5))
* **cursor:** call `initialize` after session support check ([e50c51a](https://github.com/mongodb/node-mongodb-native/commit/e50c51a))
* **encryption:** autoEncryption must error on mongodb < 4.2 ([c274615](https://github.com/mongodb/node-mongodb-native/commit/c274615))
* **encryption:** do not attempt to merge autoEncryption options ([e27fdf9](https://github.com/mongodb/node-mongodb-native/commit/e27fdf9))
* **encryption:** encryption uses smaller batch size ([cb78e69](https://github.com/mongodb/node-mongodb-native/commit/cb78e69))
* **encryption:** respect bypassAutoEncryption ([e927499](https://github.com/mongodb/node-mongodb-native/commit/e927499))
* **encryption:** respect user bson options when using autoEncryption ([cb7a3f7](https://github.com/mongodb/node-mongodb-native/commit/cb7a3f7))
* add calculated duration to server as `roundTripTime` ([cb107a8](https://github.com/mongodb/node-mongodb-native/commit/cb107a8))
* **mongodb+srv:** respect overriding SRV-provided properties ([ea83360](https://github.com/mongodb/node-mongodb-native/commit/ea83360))
* **pool:** flush workItems after next tick to avoid dupe selection ([3ec49e5](https://github.com/mongodb/node-mongodb-native/commit/3ec49e5))
* **pool:** support a `drain` event for use with unified topology ([da931ea](https://github.com/mongodb/node-mongodb-native/commit/da931ea))
* **scram:** verify server digest, ensuring mutual authentication ([806cd62](https://github.com/mongodb/node-mongodb-native/commit/806cd62))
* **srv-poller:** always provide a valid number for `intervalMS` ([afb125f](https://github.com/mongodb/node-mongodb-native/commit/afb125f))
* **topology:** correct logic for checking for sessions support ([8d157c8](https://github.com/mongodb/node-mongodb-native/commit/8d157c8))
* **topology:** don't drain iteration timers on server selection ([fed6a57](https://github.com/mongodb/node-mongodb-native/commit/fed6a57))


### Features

* add `MessageStream` for streamed wire protocol messaging ([8c44044](https://github.com/mongodb/node-mongodb-native/commit/8c44044))
* introduce a modern `Connection` replacement for CMAP ([7890e48](https://github.com/mongodb/node-mongodb-native/commit/7890e48))
* support connection establishment cancellation ([2014b7b](https://github.com/mongodb/node-mongodb-native/commit/2014b7b))
* support driver info for drivers wrapping the node driver ([1b6670b](https://github.com/mongodb/node-mongodb-native/commit/1b6670b))



<a name="3.3.5"></a>
## [3.3.5](https://github.com/mongodb/node-mongodb-native/compare/v3.3.4...v3.3.5) (2019-11-26)


### Bug Fixes

* **bulk:** use operation index from input to report operation error ([08ee53e](https://github.com/mongodb/node-mongodb-native/commit/08ee53e))
* **command:** only add TransientTransactionError label when in a transaction ([8bab074](https://github.com/mongodb/node-mongodb-native/commit/8bab074))
* **connect:** connect with family 0 instead of family 4 ([7a41279](https://github.com/mongodb/node-mongodb-native/commit/7a41279))
* **cursor:** call `initialize` after session support check ([3b076b3](https://github.com/mongodb/node-mongodb-native/commit/3b076b3))
* **mongodb+srv:** respect overriding SRV-provided properties ([5ed4c07](https://github.com/mongodb/node-mongodb-native/commit/5ed4c07))
* **pool:** support a `drain` event for use with unified topology ([3471c28](https://github.com/mongodb/node-mongodb-native/commit/3471c28))
* **topology:** correct logic for checking for sessions support ([2d976bd](https://github.com/mongodb/node-mongodb-native/commit/2d976bd))
* **topology:** don't drain iteration timers on server selection ([261f1e5](https://github.com/mongodb/node-mongodb-native/commit/261f1e5))


### Features

* support driver info for drivers wrapping the node driver ([d85c4a8](https://github.com/mongodb/node-mongodb-native/commit/d85c4a8))



<a name="3.3.4"></a>
## [3.3.4](https://github.com/mongodb/node-mongodb-native/compare/v3.3.3...v3.3.4) (2019-11-11)


### Bug Fixes

* **close:** the unified topology emits a close event on close now ([ee0db01](https://github.com/mongodb/node-mongodb-native/commit/ee0db01))
* **connect:** prevent multiple callbacks in error scenarios ([5f6a787](https://github.com/mongodb/node-mongodb-native/commit/5f6a787))
* **monitoring:** incorrect states used to determine rescheduling ([ec1e04c](https://github.com/mongodb/node-mongodb-native/commit/ec1e04c))
* **pool:** don't reset a pool if we'not already connected ([32316e4](https://github.com/mongodb/node-mongodb-native/commit/32316e4))
* **pool:** only transition to `DISCONNECTED` if reconnect enabled ([43d461e](https://github.com/mongodb/node-mongodb-native/commit/43d461e))
* **replset:** don't leak servers failing to connect ([f209160](https://github.com/mongodb/node-mongodb-native/commit/f209160))
* **replset:** use correct `topologyId` for event emission ([19549ff](https://github.com/mongodb/node-mongodb-native/commit/19549ff))
* **sdam:** `minHeartbeatIntervalMS` => `minHeartbeatFrequencyMS` ([af9fb45](https://github.com/mongodb/node-mongodb-native/commit/af9fb45))
* **sdam:** don't emit `close` every time a child server closes ([818055a](https://github.com/mongodb/node-mongodb-native/commit/818055a))
* **sdam:** don't lose servers when they fail monitoring ([8a534bb](https://github.com/mongodb/node-mongodb-native/commit/8a534bb))
* **sdam:** don't remove unknown servers in topology updates ([1147ebf](https://github.com/mongodb/node-mongodb-native/commit/1147ebf))
* **sdam:** ignore server errors when closing/closed ([49d7235](https://github.com/mongodb/node-mongodb-native/commit/49d7235))
* **server:** don't emit error in connect if closing/closed ([62ada2a](https://github.com/mongodb/node-mongodb-native/commit/62ada2a))
* **server:** ensure state is transitioned to closed on connect fail ([a471707](https://github.com/mongodb/node-mongodb-native/commit/a471707))
* **topology:** report unified topology as `nodejs` ([d126665](https://github.com/mongodb/node-mongodb-native/commit/d126665))
* **topology:** set max listeners to infinity for db event relay ([edb1335](https://github.com/mongodb/node-mongodb-native/commit/edb1335))


### Features

* **sdam_viz:** add new tool for visualizing driver sdam changes ([738189a](https://github.com/mongodb/node-mongodb-native/commit/738189a))
* **sdam_viz:** support legacy topologies in sdam_viz tool ([1a5537e](https://github.com/mongodb/node-mongodb-native/commit/1a5537e))
* **update-hints:** add support for `hint` to all update methods ([720f5e5](https://github.com/mongodb/node-mongodb-native/commit/720f5e5))



<a name="3.3.3"></a>
## [3.3.3](https://github.com/mongodb/node-mongodb-native/compare/v3.3.2...v3.3.3) (2019-10-16)


### Bug Fixes

* **change_stream:** emit 'close' event if reconnecting failed ([f24c084](https://github.com/mongodb/node-mongodb-native/commit/f24c084))
* **ChangeStream:** remove startAtOperationTime once we have resumeToken ([362afd8](https://github.com/mongodb/node-mongodb-native/commit/362afd8))
* **connect:** Switch new Buffer(size) -> Buffer.alloc(size) ([da90c3a](https://github.com/mongodb/node-mongodb-native/commit/da90c3a))
* **MongoClient:** only check own properties for valid options ([9cde4b9](https://github.com/mongodb/node-mongodb-native/commit/9cde4b9))
* **mongos:** disconnect proxies which are not mongos instances ([ee53983](https://github.com/mongodb/node-mongodb-native/commit/ee53983))
* **mongos:** force close servers during reconnect flow ([186263f](https://github.com/mongodb/node-mongodb-native/commit/186263f))
* **monitoring:** correct spelling mistake for heartbeat event ([21aa117](https://github.com/mongodb/node-mongodb-native/commit/21aa117))
* **replset:** correct server leak on initial connect ([da39d1e](https://github.com/mongodb/node-mongodb-native/commit/da39d1e))
* **replset:** destroy primary before removing from replsetstate ([45ac09a](https://github.com/mongodb/node-mongodb-native/commit/45ac09a))
* **replset:** destroy servers that are removed during SDAM flow ([9ea0190](https://github.com/mongodb/node-mongodb-native/commit/9ea0190))
* **saslprep:** add in missing saslprep dependency ([41f1165](https://github.com/mongodb/node-mongodb-native/commit/41f1165))
* **topology:** don't early abort server selection on network errors ([2b6a359](https://github.com/mongodb/node-mongodb-native/commit/2b6a359))
* **topology:** don't emit server closed event on network error ([194dcf0](https://github.com/mongodb/node-mongodb-native/commit/194dcf0))
* **topology:** include all BSON types in ctor for bson-ext support ([aa4c832](https://github.com/mongodb/node-mongodb-native/commit/aa4c832))
* **topology:** respect the `force` parameter for topology close ([d6e8936](https://github.com/mongodb/node-mongodb-native/commit/d6e8936))

### Features

* **Update:** add the ability to specify a pipeline to an update command ([#2017](https://github.com/mongodb/node-mongodb-native/issues/2017)) ([44a4110](https://github.com/mongodb/node-mongodb-native/commit/44a4110))
* **urlParser:** default useNewUrlParser to true ([52d76e3](https://github.com/mongodb/node-mongodb-native/commit/52d76e3))

<a name="3.2.7"></a>
## [3.2.7](https://github.com/mongodb/node-mongodb-native/compare/v3.2.6...v3.2.7) (2019-06-04)


### Bug Fixes

* **core:** updating core to version 3.2.7 ([2f91466](https://github.com/mongodb/node-mongodb-native/commit/2f91466))
* **findOneAndReplace:** throw error if atomic operators provided for findOneAndReplace ([6a860a3](https://github.com/mongodb/node-mongodb-native/commit/6a860a3))



<a name="3.3.2"></a>
## [3.3.2](https://github.com/mongodb/node-mongodb-native/compare/v3.3.1...v3.3.2) (2019-08-28)


### Bug Fixes

* **change-stream:** default to server default batch size ([b3ae4c5](https://github.com/mongodb/node-mongodb-native/commit/b3ae4c5))
* **execute-operation:** return promise on session support check ([a976c14](https://github.com/mongodb/node-mongodb-native/commit/a976c14))
* **gridfs-stream:** ensure `close` is emitted after last chunk ([ae94cb9](https://github.com/mongodb/node-mongodb-native/commit/ae94cb9))



<a name="3.3.1"></a>
## [3.3.1](https://github.com/mongodb/node-mongodb-native/compare/v3.3.0...v3.3.1) (2019-08-23)


### Bug Fixes

* **find:** respect client-level provided read preference ([fec4f15](https://github.com/mongodb/node-mongodb-native/commit/fec4f15))
* correct inverted defaults for unified topology ([cf598e1](https://github.com/mongodb/node-mongodb-native/commit/cf598e1))



<a name="3.3.0"></a>
# [3.3.0](https://github.com/mongodb/node-mongodb-native/compare/v3.3.0-alpha1...v3.3.0) (2019-08-13)


### Bug Fixes

* **aggregate-operation:** move type assertions to constructor ([25b27ff](https://github.com/mongodb/node-mongodb-native/commit/25b27ff))
* **autoEncryption:** tear down mongocryptd client when main client closes ([fe2f57e](https://github.com/mongodb/node-mongodb-native/commit/fe2f57e))
* **autoEncryption:** use new url parser for autoEncryption client ([d3670c2](https://github.com/mongodb/node-mongodb-native/commit/d3670c2))
* **Bulk:** change BulkWriteError message to first item from writeErrors ([#2013](https://github.com/mongodb/node-mongodb-native/issues/2013)) ([6bcf1e4](https://github.com/mongodb/node-mongodb-native/commit/6bcf1e4))
* **change_stream:** emit 'close' event if reconnecting failed ([41aba90](https://github.com/mongodb/node-mongodb-native/commit/41aba90))
* **change_stream:** emit close event after cursor is closed during error ([c2d80b2](https://github.com/mongodb/node-mongodb-native/commit/c2d80b2))
* **change-streams:** don't copy irrelevant resume options ([f190072](https://github.com/mongodb/node-mongodb-native/commit/f190072))
* **changestream:** removes all event listeners on close ([30eeeb5](https://github.com/mongodb/node-mongodb-native/commit/30eeeb5))
* **ChangeStream:** remove startAtOperationTime once we have resumeToken ([8d27e6e](https://github.com/mongodb/node-mongodb-native/commit/8d27e6e))
* **ClientSessions:** initialize clientOptions and cluster time ([b95d64e](https://github.com/mongodb/node-mongodb-native/commit/b95d64e))
* **connect:** don't treat 'connect' as an error event ([170a011](https://github.com/mongodb/node-mongodb-native/commit/170a011))
* **connect:** fixed syntax issue in connect error handler ([ff7166d](https://github.com/mongodb/node-mongodb-native/commit/ff7166d))
* **connections_stepdown_tests:** use correct version of mongo for tests ([ce2c9af](https://github.com/mongodb/node-mongodb-native/commit/ce2c9af))
* **createCollection:** Db.createCollection should pass readConcern to new collection ([#2026](https://github.com/mongodb/node-mongodb-native/issues/2026)) ([6145d4b](https://github.com/mongodb/node-mongodb-native/commit/6145d4b))
* **cursor:** do not truncate an existing Long ([317055b](https://github.com/mongodb/node-mongodb-native/commit/317055b)), closes [mongodb-js/mongodb-core#441](https://github.com/mongodb-js/mongodb-core/issues/441)
* **distinct:** return full response if `full` option was specified ([95a7d05](https://github.com/mongodb/node-mongodb-native/commit/95a7d05))
* **MongoClient:** allow Object.prototype items as db names ([dc6fc37](https://github.com/mongodb/node-mongodb-native/commit/dc6fc37))
* **MongoClient:** only check own properties for valid options ([c9dc717](https://github.com/mongodb/node-mongodb-native/commit/c9dc717))
* **OpMsg:** cap requestIds at 0x7fffffff ([c0e87d5](https://github.com/mongodb/node-mongodb-native/commit/c0e87d5))
* **read-operations:** send sessions on all read operations ([4d45c8a](https://github.com/mongodb/node-mongodb-native/commit/4d45c8a))
* **ReadPreference:** improve ReadPreference error message and remove irrelevant sharding test ([dd34ce4](https://github.com/mongodb/node-mongodb-native/commit/dd34ce4))
* **ReadPreference:** only allow valid ReadPreference modes ([06bbef2](https://github.com/mongodb/node-mongodb-native/commit/06bbef2))
* **replset:** correct legacy max staleness calculation ([2eab8aa](https://github.com/mongodb/node-mongodb-native/commit/2eab8aa))
* **replset:** introduce a fixed-time server selection loop ([cf53299](https://github.com/mongodb/node-mongodb-native/commit/cf53299))
* **server:** emit "first connect" error if initial connect fails due to ECONNREFUSED ([#2016](https://github.com/mongodb/node-mongodb-native/issues/2016)) ([5a7b15b](https://github.com/mongodb/node-mongodb-native/commit/5a7b15b))
* **serverSelection:** make sure to pass session to serverSelection ([eb5cc6b](https://github.com/mongodb/node-mongodb-native/commit/eb5cc6b))
* **sessions:** ensure an error is thrown when attempting sharded transactions ([3a1fdc1](https://github.com/mongodb/node-mongodb-native/commit/3a1fdc1))
* **topology:** add new error for retryWrites on MMAPv1 ([392f5a6](https://github.com/mongodb/node-mongodb-native/commit/392f5a6))
* don't check non-unified topologies for session support check ([2bccd3f](https://github.com/mongodb/node-mongodb-native/commit/2bccd3f))
* maintain internal database name on collection rename ([884d46f](https://github.com/mongodb/node-mongodb-native/commit/884d46f))
* only check for transaction state if session exists ([360975a](https://github.com/mongodb/node-mongodb-native/commit/360975a))
* preserve aggregate explain support for legacy servers ([032b204](https://github.com/mongodb/node-mongodb-native/commit/032b204))
* read concern only supported for `mapReduce` without inline ([51a36f3](https://github.com/mongodb/node-mongodb-native/commit/51a36f3))
* reintroduce support for 2.6 listIndexes ([c3bfc05](https://github.com/mongodb/node-mongodb-native/commit/c3bfc05))
* return `executeOperation` for explain, if promise is desired ([b4a7ad7](https://github.com/mongodb/node-mongodb-native/commit/b4a7ad7))
* validate atomic operations in all update methods ([88bb77e](https://github.com/mongodb/node-mongodb-native/commit/88bb77e))
* **transactions:** fix error message for attempting sharded ([eb5dfc9](https://github.com/mongodb/node-mongodb-native/commit/eb5dfc9))
* **transactions:** fix sharded transaction error logic ([083e18a](https://github.com/mongodb/node-mongodb-native/commit/083e18a))


### Features

* **Aggregate:** support ReadConcern in aggregates with $out ([21cdcf0](https://github.com/mongodb/node-mongodb-native/commit/21cdcf0))
* **AutoEncryption:** improve error message for missing mongodb-client-encryption ([583f29f](https://github.com/mongodb/node-mongodb-native/commit/583f29f))
* **ChangeStream:** adds new resume functionality to ChangeStreams ([9ec9b8f](https://github.com/mongodb/node-mongodb-native/commit/9ec9b8f))
* **ChangeStreamCursor:** introduce new cursor type for change streams ([8813eb0](https://github.com/mongodb/node-mongodb-native/commit/8813eb0))
* **cryptdConnectionString:** makes mongocryptd uri configurable ([#2049](https://github.com/mongodb/node-mongodb-native/issues/2049)) ([a487be4](https://github.com/mongodb/node-mongodb-native/commit/a487be4))
* **eachAsync:** dedupe async iteration with a common helper ([c296f3a](https://github.com/mongodb/node-mongodb-native/commit/c296f3a))
* **execute-operation:** allow execution with server selection ([36bc1fd](https://github.com/mongodb/node-mongodb-native/commit/36bc1fd))
* **pool:** add support for resetting the connection pool ([2d1ff40](https://github.com/mongodb/node-mongodb-native/commit/2d1ff40))
* **sessions:** track dirty state of sessions, drop after use ([f61df16](https://github.com/mongodb/node-mongodb-native/commit/f61df16))
* add concept of `data-bearing` type to `ServerDescription` ([852e14f](https://github.com/mongodb/node-mongodb-native/commit/852e14f))
* **transaction:** allow applications to set maxTimeMS for commitTransaction ([b3948aa](https://github.com/mongodb/node-mongodb-native/commit/b3948aa))
* **Update:** add the ability to specify a pipeline to an update command ([#2017](https://github.com/mongodb/node-mongodb-native/issues/2017)) ([dc1387e](https://github.com/mongodb/node-mongodb-native/commit/dc1387e))
* add `known`, `data-bearing` filters to `TopologyDescription` ([d0ccb56](https://github.com/mongodb/node-mongodb-native/commit/d0ccb56))
* perform selection before cursor operation execution if needed ([808cf37](https://github.com/mongodb/node-mongodb-native/commit/808cf37))
* perform selection before operation execution if needed ([1a25876](https://github.com/mongodb/node-mongodb-native/commit/1a25876))
* support explain operations in `CommandOperationV2` ([86f5ba5](https://github.com/mongodb/node-mongodb-native/commit/86f5ba5))
* support operations passed to a `Cursor` or subclass ([b78bb89](https://github.com/mongodb/node-mongodb-native/commit/b78bb89))



<a name="3.2.7"></a>
## [3.2.7](https://github.com/mongodb/node-mongodb-native/compare/v3.2.6...v3.2.7) (2019-06-04)


### Bug Fixes

* **core:** updating core to version 3.2.7 ([2f91466](https://github.com/mongodb/node-mongodb-native/commit/2f91466))
* **findOneAndReplace:** throw error if atomic operators provided for findOneAndReplace ([6a860a3](https://github.com/mongodb/node-mongodb-native/commit/6a860a3))



<a name="3.2.6"></a>
## [3.2.6](https://github.com/mongodb/node-mongodb-native/compare/v3.2.5...v3.2.6) (2019-05-24)



<a name="3.2.5"></a>
## [3.2.5](https://github.com/mongodb/node-mongodb-native/compare/v3.2.4...v3.2.5) (2019-05-17)


### Bug Fixes

* **core:** updating core to 3.2.5 ([a2766c1](https://github.com/mongodb/node-mongodb-native/commit/a2766c1))



<a name="3.2.4"></a>
## [3.2.4](https://github.com/mongodb/node-mongodb-native/compare/v3.2.2...v3.2.4) (2019-05-08)


### Bug Fixes

* **aggregation:** fix field name typo ([4235d04](https://github.com/mongodb/node-mongodb-native/commit/4235d04))
* **async:** rewrote asyncGenerator in node < 10 syntax ([49c8cef](https://github.com/mongodb/node-mongodb-native/commit/49c8cef))
* **BulkOp:** run unordered bulk ops in serial ([f548bd7](https://github.com/mongodb/node-mongodb-native/commit/f548bd7))
* **bulkWrite:** fix issue with bulkWrite continuing w/ callback ([2a4a42c](https://github.com/mongodb/node-mongodb-native/commit/2a4a42c))
* **docs:** correctly document that default for `sslValidate` is false ([1f8e7fa](https://github.com/mongodb/node-mongodb-native/commit/1f8e7fa))
* **gridfs-stream:** honor chunk size ([9eeb114](https://github.com/mongodb/node-mongodb-native/commit/9eeb114))
* **unified-topology:** only clone pool size if provided ([8dc2416](https://github.com/mongodb/node-mongodb-native/commit/8dc2416))


### Features

* update to mongodb-core v3.2.3 ([1c5357a](https://github.com/mongodb/node-mongodb-native/commit/1c5357a))
* **core:** update to mongodb-core v3.2.4 ([2059260](https://github.com/mongodb/node-mongodb-native/commit/2059260))
* **lib:** implement executeOperationV2 ([67d4edf](https://github.com/mongodb/node-mongodb-native/commit/67d4edf))



<a name="3.2.3"></a>
## [3.2.3](https://github.com/mongodb/node-mongodb-native/compare/v3.2.2...v3.2.3) (2019-04-05)


### Bug Fixes

* **aggregation:** fix field name typo ([4235d04](https://github.com/mongodb/node-mongodb-native/commit/4235d04))
* **async:** rewrote asyncGenerator in node < 10 syntax ([49c8cef](https://github.com/mongodb/node-mongodb-native/commit/49c8cef))
* **bulkWrite:** fix issue with bulkWrite continuing w/ callback ([2a4a42c](https://github.com/mongodb/node-mongodb-native/commit/2a4a42c))
* **docs:** correctly document that default for `sslValidate` is false ([1f8e7fa](https://github.com/mongodb/node-mongodb-native/commit/1f8e7fa))


### Features

* update to mongodb-core v3.2.3 ([1c5357a](https://github.com/mongodb/node-mongodb-native/commit/1c5357a))



<a name="3.2.2"></a>
## [3.2.2](https://github.com/mongodb/node-mongodb-native/compare/v3.2.1...v3.2.2) (2019-03-22)


### Bug Fixes

* **asyncIterator:** stronger guard against importing async generator ([e0826fb](https://github.com/mongodb/node-mongodb-native/commit/e0826fb))


### Features

* update to mongodb-core v3.2.2 ([868cfc3](https://github.com/mongodb/node-mongodb-native/commit/868cfc3))



<a name="3.2.1"></a>
## [3.2.1](https://github.com/mongodb/node-mongodb-native/compare/v3.2.0...v3.2.1) (2019-03-21)


### Features

* **core:** update to mongodb-core v3.2.1 ([30b0100](https://github.com/mongodb/node-mongodb-native/commit/30b0100))



<a name="3.2.0"></a>
# [3.2.0](https://github.com/mongodb/node-mongodb-native/compare/v3.1.13...v3.2.0) (2019-03-21)


### Bug Fixes

* **aggregate:** do not send batchSize for aggregation with $out ([ddb8d90](https://github.com/mongodb/node-mongodb-native/commit/ddb8d90))
* **bulkWrite:** always count undefined values in bson size for bulk ([436d340](https://github.com/mongodb/node-mongodb-native/commit/436d340))
* **db_ops:** rename db to add user on ([79931af](https://github.com/mongodb/node-mongodb-native/commit/79931af))
* **mongo_client_ops:** only skip authentication if no authMechanism is specified ([3b6957d](https://github.com/mongodb/node-mongodb-native/commit/3b6957d))
* **mongo-client:** ensure close callback is called with client ([f39e881](https://github.com/mongodb/node-mongodb-native/commit/f39e881))


### Features

* **core:** pin to mongodb-core v3.2.0 ([22af15a](https://github.com/mongodb/node-mongodb-native/commit/22af15a))
* **Cursor:** adds support for AsyncIterator in cursors ([b972c1e](https://github.com/mongodb/node-mongodb-native/commit/b972c1e))
* **db:** add database-level aggregation ([b629b21](https://github.com/mongodb/node-mongodb-native/commit/b629b21))
* **mongo-client:** remove deprecated `logout` and print warning ([542859d](https://github.com/mongodb/node-mongodb-native/commit/542859d))
* **topology-base:** support passing callbacks to `close` method ([7c111e0](https://github.com/mongodb/node-mongodb-native/commit/7c111e0))
* **transactions:** support pinning mongos for sharded txns ([3886127](https://github.com/mongodb/node-mongodb-native/commit/3886127))
* **unified-sdam:** backport unified SDAM to master for v3.2.0 ([79f33ca](https://github.com/mongodb/node-mongodb-native/commit/79f33ca))



<a name="3.1.13"></a>
## [3.1.13](https://github.com/mongodb/node-mongodb-native/compare/v3.1.12...v3.1.13) (2019-01-23)


### Bug Fixes

* restore ability to webpack by removing `makeLazyLoader` ([050267d](https://github.com/mongodb/node-mongodb-native/commit/050267d))
* **bulk:** honor ignoreUndefined in initializeUnorderedBulkOp ([e806be4](https://github.com/mongodb/node-mongodb-native/commit/e806be4))
* **changeStream:** properly handle changeStream event mid-close ([#1902](https://github.com/mongodb/node-mongodb-native/issues/1902)) ([5ad9fa9](https://github.com/mongodb/node-mongodb-native/commit/5ad9fa9))
* **db_ops:** ensure we async resolve errors in createCollection ([210c71d](https://github.com/mongodb/node-mongodb-native/commit/210c71d))



<a name="3.1.12"></a>
## [3.1.12](https://github.com/mongodb/node-mongodb-native/compare/v3.1.11...v3.1.12) (2019-01-16)


### Features

* **core:** update to mongodb-core v3.1.11 ([9bef6e7](https://github.com/mongodb/node-mongodb-native/commit/9bef6e7))



<a name="3.1.11"></a>
## [3.1.11](https://github.com/mongodb/node-mongodb-native/compare/v3.1.10...v3.1.11) (2019-01-15)


### Bug Fixes

* **bulk:** fix error propagation in empty bulk.execute ([a3adb3f](https://github.com/mongodb/node-mongodb-native/commit/a3adb3f))
* **bulk:** make sure that any error in bulk write is propagated ([bedc2d2](https://github.com/mongodb/node-mongodb-native/commit/bedc2d2))
* **bulk:** properly calculate batch size for bulk writes ([aafe71b](https://github.com/mongodb/node-mongodb-native/commit/aafe71b))
* **operations:** do not call require in a hot path ([ff82ff4](https://github.com/mongodb/node-mongodb-native/commit/ff82ff4))



<a name="3.1.10"></a>
## [3.1.10](https://github.com/mongodb/node-mongodb-native/compare/v3.1.9...v3.1.10) (2018-11-16)


### Bug Fixes

* **auth:** remember to default to admin database ([c7dec28](https://github.com/mongodb/node-mongodb-native/commit/c7dec28))


### Features

* **core:** update to mongodb-core v3.1.9 ([bd3355b](https://github.com/mongodb/node-mongodb-native/commit/bd3355b))



<a name="3.1.9"></a>
## [3.1.9](https://github.com/mongodb/node-mongodb-native/compare/v3.1.8...v3.1.9) (2018-11-06)


### Bug Fixes

* **db:** move db constants to other file to avoid circular ref ([#1858](https://github.com/mongodb/node-mongodb-native/issues/1858)) ([239036f](https://github.com/mongodb/node-mongodb-native/commit/239036f))
* **estimated-document-count:** support options other than maxTimeMs ([36c3c7d](https://github.com/mongodb/node-mongodb-native/commit/36c3c7d))


### Features

* **core:** update to mongodb-core v3.1.8 ([80d7c79](https://github.com/mongodb/node-mongodb-native/commit/80d7c79))



<a name="3.1.8"></a>
## [3.1.8](https://github.com/mongodb/node-mongodb-native/compare/v3.1.7...v3.1.8) (2018-10-10)


### Bug Fixes

* **connect:** use reported default databse from new uri parser ([811f8f8](https://github.com/mongodb/node-mongodb-native/commit/811f8f8))


### Features

* **core:** update to mongodb-core v3.1.7 ([dbfc905](https://github.com/mongodb/node-mongodb-native/commit/dbfc905))



<a name="3.1.7"></a>
## [3.1.7](https://github.com/mongodb/node-mongodb-native/compare/v3.1.6...v3.1.7) (2018-10-09)


### Features

* **core:** update mongodb-core to v3.1.6 ([61b054e](https://github.com/mongodb/node-mongodb-native/commit/61b054e))



<a name="3.1.6"></a>
## [3.1.6](https://github.com/mongodb/node-mongodb-native/compare/v3.1.5...v3.1.6) (2018-09-15)


### Features

* **core:** update to core v3.1.5 ([c5f823d](https://github.com/mongodb/node-mongodb-native/commit/c5f823d))



<a name="3.1.5"></a>
## [3.1.5](https://github.com/mongodb/node-mongodb-native/compare/v3.1.4...v3.1.5) (2018-09-14)


### Bug Fixes

* **cursor:** allow `$meta` based sort when passing an array to `sort()` ([f93a8c3](https://github.com/mongodb/node-mongodb-native/commit/f93a8c3))
* **utils:** only set retryWrites to true for valid operations ([3b725ef](https://github.com/mongodb/node-mongodb-native/commit/3b725ef))


### Features

* **core:** bump core to v3.1.4 ([805d58a](https://github.com/mongodb/node-mongodb-native/commit/805d58a))



<a name="3.1.4"></a>
## [3.1.4](https://github.com/mongodb/node-mongodb-native/compare/v3.1.3...v3.1.4) (2018-08-25)


### Bug Fixes

* **buffer:** use safe-buffer polyfill to maintain compatibility ([327da95](https://github.com/mongodb/node-mongodb-native/commit/327da95))
* **change-stream:** properly support resumablity in stream mode ([c43a34b](https://github.com/mongodb/node-mongodb-native/commit/c43a34b))
* **connect:** correct replacement of topology on connect callback ([918a1e0](https://github.com/mongodb/node-mongodb-native/commit/918a1e0))
* **cursor:** remove deprecated notice on forEach ([a474158](https://github.com/mongodb/node-mongodb-native/commit/a474158))
* **url-parser:** bail early on validation when using domain socket ([3cb3da3](https://github.com/mongodb/node-mongodb-native/commit/3cb3da3))


### Features

* **client-ops:** allow bypassing creation of topologies on connect ([fe39b93](https://github.com/mongodb/node-mongodb-native/commit/fe39b93))
* **core:** update mongodb-core to 3.1.3 ([a029047](https://github.com/mongodb/node-mongodb-native/commit/a029047))
* **test:** use connection strings for all calls to `newClient` ([1dac18f](https://github.com/mongodb/node-mongodb-native/commit/1dac18f))



<a name="3.1.3"></a>
## [3.1.3](https://github.com/mongodb/node-mongodb-native/compare/v3.1.2...v3.1.3) (2018-08-13)


### Features

* **core:** update to mongodb-core 3.1.2 ([337cb79](https://github.com/mongodb/node-mongodb-native/commit/337cb79))



<a name="3.1.2"></a>
## [3.1.2](https://github.com/mongodb/node-mongodb-native/compare/v3.0.6...v3.1.2) (2018-08-13)


### Bug Fixes

* **aggregate:** support user-provided `batchSize` ([ad10dee](https://github.com/mongodb/node-mongodb-native/commit/ad10dee))
* **buffer:** replace deprecated Buffer constructor ([759dd85](https://github.com/mongodb/node-mongodb-native/commit/759dd85))
* **bulk:** fixing retryable writes for mass-change ops ([0604036](https://github.com/mongodb/node-mongodb-native/commit/0604036))
* **bulk:** handle MongoWriteConcernErrors ([12ff392](https://github.com/mongodb/node-mongodb-native/commit/12ff392))
* **change_stream:** do not check isGetMore if error[mongoErrorContextSymbol] is undefined ([#1720](https://github.com/mongodb/node-mongodb-native/issues/1720)) ([844c2c8](https://github.com/mongodb/node-mongodb-native/commit/844c2c8))
* **change-stream:** fix change stream resuming with promises ([3063f00](https://github.com/mongodb/node-mongodb-native/commit/3063f00))
* **client-ops:** return transform map to map rather than function ([cfb7d83](https://github.com/mongodb/node-mongodb-native/commit/cfb7d83))
* **collection:** correctly shallow clone passed in options ([7727700](https://github.com/mongodb/node-mongodb-native/commit/7727700))
* **collection:** countDocuments throws error when query doesn't match docs ([09c7d8e](https://github.com/mongodb/node-mongodb-native/commit/09c7d8e))
* **collection:** depend on `resolveReadPreference` for inheritance ([a649e35](https://github.com/mongodb/node-mongodb-native/commit/a649e35))
* **collection:** ensure findAndModify always use readPreference primary ([86344f4](https://github.com/mongodb/node-mongodb-native/commit/86344f4))
* **collection:** isCapped returns false instead of undefined ([b8471f1](https://github.com/mongodb/node-mongodb-native/commit/b8471f1))
* **collection:** only send bypassDocumentValidation if true ([fdb828b](https://github.com/mongodb/node-mongodb-native/commit/fdb828b))
* **count-documents:** return callback on error case ([fca1185](https://github.com/mongodb/node-mongodb-native/commit/fca1185))
* **cursor:** cursor count with collation fix ([71879c3](https://github.com/mongodb/node-mongodb-native/commit/71879c3))
* **cursor:** cursor hasNext returns false when exhausted ([184b817](https://github.com/mongodb/node-mongodb-native/commit/184b817))
* **cursor:** cursor.count not respecting parent readPreference ([5a9fdf0](https://github.com/mongodb/node-mongodb-native/commit/5a9fdf0))
* **cursor:** set readPreference for cursor.count ([13d776f](https://github.com/mongodb/node-mongodb-native/commit/13d776f))
* **db:** don't send session down to createIndex command ([559c195](https://github.com/mongodb/node-mongodb-native/commit/559c195))
* **db:** throw readable error when creating `_id` with background: true ([b3ff3ed](https://github.com/mongodb/node-mongodb-native/commit/b3ff3ed))
* **db_ops:** call collection.find() with correct parameters ([#1795](https://github.com/mongodb/node-mongodb-native/issues/1795)) ([36e92f1](https://github.com/mongodb/node-mongodb-native/commit/36e92f1))
* **db_ops:** fix two incorrectly named variables ([15dc808](https://github.com/mongodb/node-mongodb-native/commit/15dc808))
* **findOneAndUpdate:** ensure that update documents contain atomic operators ([eb68074](https://github.com/mongodb/node-mongodb-native/commit/eb68074))
* **index:** export MongoNetworkError ([98ab29e](https://github.com/mongodb/node-mongodb-native/commit/98ab29e))
* **mongo_client:** translate options for connectWithUrl ([78f6977](https://github.com/mongodb/node-mongodb-native/commit/78f6977))
* **mongo-client:** pass arguments to ctor when new keyword is used ([d6c3417](https://github.com/mongodb/node-mongodb-native/commit/d6c3417))
* **mongos:** bubble up close events after the first one ([#1713](https://github.com/mongodb/node-mongodb-native/issues/1713)) ([3e91d77](https://github.com/mongodb/node-mongodb-native/commit/3e91d77)), closes [Automattic/mongoose#6249](https://github.com/Automattic/mongoose/issues/6249) [#1685](https://github.com/mongodb/node-mongodb-native/issues/1685)
* **parallelCollectionScan:** do not use implicit sessions on cursors ([2de470a](https://github.com/mongodb/node-mongodb-native/commit/2de470a))
* **retryWrites:** fixes more bulk ops to not use retryWrites ([69e5254](https://github.com/mongodb/node-mongodb-native/commit/69e5254))
* **server:** remove unnecessary print statement ([2bcbc12](https://github.com/mongodb/node-mongodb-native/commit/2bcbc12))
* **teardown:** properly destroy a topology when initial connect fails ([b8d2f1d](https://github.com/mongodb/node-mongodb-native/commit/b8d2f1d))
* **topology-base:** sending `endSessions` is always skipped now ([a276cbe](https://github.com/mongodb/node-mongodb-native/commit/a276cbe))
* **txns:** omit writeConcern when in a transaction ([b88c938](https://github.com/mongodb/node-mongodb-native/commit/b88c938))
* **utils:** restructure inheritance rules for read preferences ([6a7dac1](https://github.com/mongodb/node-mongodb-native/commit/6a7dac1))


### Features

* **auth:** add support for SCRAM-SHA-256 ([f53195d](https://github.com/mongodb/node-mongodb-native/commit/f53195d))
* **changeStream:** Adding new 4.0 ChangeStream features ([2cb4894](https://github.com/mongodb/node-mongodb-native/commit/2cb4894))
* **changeStream:** allow resuming on getMore errors ([4ba5adc](https://github.com/mongodb/node-mongodb-native/commit/4ba5adc))
* **changeStream:** expanding changeStream resumable errors ([49fbafd](https://github.com/mongodb/node-mongodb-native/commit/49fbafd))
* **ChangeStream:** update default startAtOperationTime ([50a9f65](https://github.com/mongodb/node-mongodb-native/commit/50a9f65))
* **collection:** add colleciton level document mapping/unmapping ([d03335e](https://github.com/mongodb/node-mongodb-native/commit/d03335e))
* **collection:** Implement new count API ([a5240ae](https://github.com/mongodb/node-mongodb-native/commit/a5240ae))
* **Collection:** warn if callback is not function in find and findOne ([cddaba0](https://github.com/mongodb/node-mongodb-native/commit/cddaba0))
* **core:** bump core dependency to v3.1.0 ([4937240](https://github.com/mongodb/node-mongodb-native/commit/4937240))
* **cursor:** new cursor.transformStream method ([397fcd2](https://github.com/mongodb/node-mongodb-native/commit/397fcd2))
* **deprecation:** create deprecation function ([4f907a0](https://github.com/mongodb/node-mongodb-native/commit/4f907a0))
* **deprecation:** wrap deprecated functions ([a5d0f1d](https://github.com/mongodb/node-mongodb-native/commit/a5d0f1d))
* **GridFS:** add option to disable md5 in file upload ([704a88e](https://github.com/mongodb/node-mongodb-native/commit/704a88e))
* **listCollections:** add support for nameOnly option ([d2d0367](https://github.com/mongodb/node-mongodb-native/commit/d2d0367))
* **parallelCollectionScan:** does not allow user to pass a session ([4da9e03](https://github.com/mongodb/node-mongodb-native/commit/4da9e03))
* **read-preference:** add transaction to inheritance rules ([18ca41d](https://github.com/mongodb/node-mongodb-native/commit/18ca41d))
* **read-preference:** unify means of read preference resolution ([#1738](https://github.com/mongodb/node-mongodb-native/issues/1738)) ([2995e11](https://github.com/mongodb/node-mongodb-native/commit/2995e11))
* **urlParser:** use core URL parser ([c1c5d8d](https://github.com/mongodb/node-mongodb-native/commit/c1c5d8d))
* **withSession:** add top level helper for session lifetime ([9976b86](https://github.com/mongodb/node-mongodb-native/commit/9976b86))


### Reverts

* **collection:** reverting collection-mapping features ([7298c76](https://github.com/mongodb/node-mongodb-native/commit/7298c76)), closes [#1698](https://github.com/mongodb/node-mongodb-native/issues/1698) [mongodb/js-bson#253](https://github.com/mongodb/js-bson/issues/253)



<a name="3.1.1"></a>
## [3.1.1](https://github.com/mongodb/node-mongodb-native/compare/v3.1.0...v3.1.1) (2018-07-05)


### Bug Fixes

* **client-ops:** return transform map to map rather than function ([b8b4bfa](https://github.com/mongodb/node-mongodb-native/commit/b8b4bfa))
* **collection:** correctly shallow clone passed in options ([2e6c4fa](https://github.com/mongodb/node-mongodb-native/commit/2e6c4fa))
* **collection:** countDocuments throws error when query doesn't match docs ([4e83556](https://github.com/mongodb/node-mongodb-native/commit/4e83556))
* **server:** remove unnecessary print statement ([20e11b3](https://github.com/mongodb/node-mongodb-native/commit/20e11b3))



<a name="3.1.0"></a>
# [3.1.0](https://github.com/mongodb/node-mongodb-native/compare/v3.0.6...v3.1.0) (2018-06-27)


### Bug Fixes

* **aggregate:** support user-provided `batchSize` ([ad10dee](https://github.com/mongodb/node-mongodb-native/commit/ad10dee))
* **bulk:** fixing retryable writes for mass-change ops ([0604036](https://github.com/mongodb/node-mongodb-native/commit/0604036))
* **bulk:** handle MongoWriteConcernErrors ([12ff392](https://github.com/mongodb/node-mongodb-native/commit/12ff392))
* **change_stream:** do not check isGetMore if error[mongoErrorContextSymbol] is undefined ([#1720](https://github.com/mongodb/node-mongodb-native/issues/1720)) ([844c2c8](https://github.com/mongodb/node-mongodb-native/commit/844c2c8))
* **change-stream:** fix change stream resuming with promises ([3063f00](https://github.com/mongodb/node-mongodb-native/commit/3063f00))
* **collection:** depend on `resolveReadPreference` for inheritance ([a649e35](https://github.com/mongodb/node-mongodb-native/commit/a649e35))
* **collection:** only send bypassDocumentValidation if true ([fdb828b](https://github.com/mongodb/node-mongodb-native/commit/fdb828b))
* **cursor:** cursor count with collation fix ([71879c3](https://github.com/mongodb/node-mongodb-native/commit/71879c3))
* **cursor:** cursor hasNext returns false when exhausted ([184b817](https://github.com/mongodb/node-mongodb-native/commit/184b817))
* **cursor:** cursor.count not respecting parent readPreference ([5a9fdf0](https://github.com/mongodb/node-mongodb-native/commit/5a9fdf0))
* **db:** don't send session down to createIndex command ([559c195](https://github.com/mongodb/node-mongodb-native/commit/559c195))
* **db:** throw readable error when creating `_id` with background: true ([b3ff3ed](https://github.com/mongodb/node-mongodb-native/commit/b3ff3ed))
* **findOneAndUpdate:** ensure that update documents contain atomic operators ([eb68074](https://github.com/mongodb/node-mongodb-native/commit/eb68074))
* **index:** export MongoNetworkError ([98ab29e](https://github.com/mongodb/node-mongodb-native/commit/98ab29e))
* **mongo-client:** pass arguments to ctor when new keyword is used ([d6c3417](https://github.com/mongodb/node-mongodb-native/commit/d6c3417))
* **mongos:** bubble up close events after the first one ([#1713](https://github.com/mongodb/node-mongodb-native/issues/1713)) ([3e91d77](https://github.com/mongodb/node-mongodb-native/commit/3e91d77)), closes [Automattic/mongoose#6249](https://github.com/Automattic/mongoose/issues/6249) [#1685](https://github.com/mongodb/node-mongodb-native/issues/1685)
* **parallelCollectionScan:** do not use implicit sessions on cursors ([2de470a](https://github.com/mongodb/node-mongodb-native/commit/2de470a))
* **retryWrites:** fixes more bulk ops to not use retryWrites ([69e5254](https://github.com/mongodb/node-mongodb-native/commit/69e5254))
* **topology-base:** sending `endSessions` is always skipped now ([a276cbe](https://github.com/mongodb/node-mongodb-native/commit/a276cbe))
* **txns:** omit writeConcern when in a transaction ([b88c938](https://github.com/mongodb/node-mongodb-native/commit/b88c938))
* **utils:** restructure inheritance rules for read preferences ([6a7dac1](https://github.com/mongodb/node-mongodb-native/commit/6a7dac1))


### Features

* **auth:** add support for SCRAM-SHA-256 ([f53195d](https://github.com/mongodb/node-mongodb-native/commit/f53195d))
* **changeStream:** Adding new 4.0 ChangeStream features ([2cb4894](https://github.com/mongodb/node-mongodb-native/commit/2cb4894))
* **changeStream:** allow resuming on getMore errors ([4ba5adc](https://github.com/mongodb/node-mongodb-native/commit/4ba5adc))
* **changeStream:** expanding changeStream resumable errors ([49fbafd](https://github.com/mongodb/node-mongodb-native/commit/49fbafd))
* **ChangeStream:** update default startAtOperationTime ([50a9f65](https://github.com/mongodb/node-mongodb-native/commit/50a9f65))
* **collection:** add colleciton level document mapping/unmapping ([d03335e](https://github.com/mongodb/node-mongodb-native/commit/d03335e))
* **collection:** Implement new count API ([a5240ae](https://github.com/mongodb/node-mongodb-native/commit/a5240ae))
* **Collection:** warn if callback is not function in find and findOne ([cddaba0](https://github.com/mongodb/node-mongodb-native/commit/cddaba0))
* **core:** bump core dependency to v3.1.0 ([855bfdb](https://github.com/mongodb/node-mongodb-native/commit/855bfdb))
* **cursor:** new cursor.transformStream method ([397fcd2](https://github.com/mongodb/node-mongodb-native/commit/397fcd2))
* **GridFS:** add option to disable md5 in file upload ([704a88e](https://github.com/mongodb/node-mongodb-native/commit/704a88e))
* **listCollections:** add support for nameOnly option ([d2d0367](https://github.com/mongodb/node-mongodb-native/commit/d2d0367))
* **parallelCollectionScan:** does not allow user to pass a session ([4da9e03](https://github.com/mongodb/node-mongodb-native/commit/4da9e03))
* **read-preference:** add transaction to inheritance rules ([18ca41d](https://github.com/mongodb/node-mongodb-native/commit/18ca41d))
* **read-preference:** unify means of read preference resolution ([#1738](https://github.com/mongodb/node-mongodb-native/issues/1738)) ([2995e11](https://github.com/mongodb/node-mongodb-native/commit/2995e11))
* **urlParser:** use core URL parser ([c1c5d8d](https://github.com/mongodb/node-mongodb-native/commit/c1c5d8d))
* **withSession:** add top level helper for session lifetime ([9976b86](https://github.com/mongodb/node-mongodb-native/commit/9976b86))


### Reverts

* **collection:** reverting collection-mapping features ([7298c76](https://github.com/mongodb/node-mongodb-native/commit/7298c76)), closes [#1698](https://github.com/mongodb/node-mongodb-native/issues/1698) [mongodb/js-bson#253](https://github.com/mongodb/js-bson/issues/253)



<a name="3.0.6"></a>
## [3.0.6](https://github.com/mongodb/node-mongodb-native/compare/v3.0.5...v3.0.6) (2018-04-09)


### Bug Fixes

* **db:** ensure `dropDatabase` always uses primary read preference ([e62e5c9](https://github.com/mongodb/node-mongodb-native/commit/e62e5c9))
* **driverBench:** driverBench has default options object now ([c557817](https://github.com/mongodb/node-mongodb-native/commit/c557817))


### Features

* **command-monitoring:** support enabling command monitoring ([5903680](https://github.com/mongodb/node-mongodb-native/commit/5903680))
* **core:** update to mongodb-core v3.0.6 ([cfdd0ae](https://github.com/mongodb/node-mongodb-native/commit/cfdd0ae))
* **driverBench:** Implementing DriverBench ([d10fbad](https://github.com/mongodb/node-mongodb-native/commit/d10fbad))



<a name="3.0.5"></a>
## [3.0.5](https://github.com/mongodb/node-mongodb-native/compare/v3.0.4...v3.0.5) (2018-03-23)


### Bug Fixes

* **AggregationCursor:** adding session tracking to AggregationCursor ([baca5b7](https://github.com/mongodb/node-mongodb-native/commit/baca5b7))
* **Collection:** fix session leak in parallelCollectonScan ([3331ec9](https://github.com/mongodb/node-mongodb-native/commit/3331ec9))
* **comments:** adding fixes for PR comments ([ee110ac](https://github.com/mongodb/node-mongodb-native/commit/ee110ac))
* **url_parser:** support a default database on mongodb+srv uris ([6d39b2a](https://github.com/mongodb/node-mongodb-native/commit/6d39b2a))


### Features

* **sessions:** adding implicit cursor session support ([a81245b](https://github.com/mongodb/node-mongodb-native/commit/a81245b))



<a name="3.0.4"></a>
## [3.0.4](https://github.com/mongodb/node-mongodb-native/compare/v3.0.2...v3.0.4) (2018-03-05)


### Bug Fixes

* **collection:** fix error when calling remove with no args ([#1657](https://github.com/mongodb/node-mongodb-native/issues/1657)) ([4c9b0f8](https://github.com/mongodb/node-mongodb-native/commit/4c9b0f8))
* **executeOperation:** don't mutate options passed to commands ([934a43a](https://github.com/mongodb/node-mongodb-native/commit/934a43a))
* **jsdoc:** mark db.collection callback as optional + typo fix ([#1658](https://github.com/mongodb/node-mongodb-native/issues/1658)) ([c519b9b](https://github.com/mongodb/node-mongodb-native/commit/c519b9b))
* **sessions:** move active session tracking to topology base ([#1665](https://github.com/mongodb/node-mongodb-native/issues/1665)) ([b1f296f](https://github.com/mongodb/node-mongodb-native/commit/b1f296f))
* **utils:** fixes executeOperation to clean up sessions ([04e6ef6](https://github.com/mongodb/node-mongodb-native/commit/04e6ef6))


### Features

* **default-db:** use dbName from uri if none provided ([23b1938](https://github.com/mongodb/node-mongodb-native/commit/23b1938))
* **mongodb-core:** update to mongodb-core 3.0.4 ([1fdbaa5](https://github.com/mongodb/node-mongodb-native/commit/1fdbaa5))



<a name="3.0.3"></a>
## [3.0.3](https://github.com/mongodb/node-mongodb-native/compare/v3.0.2...v3.0.3) (2018-02-23)


### Bug Fixes

* **collection:** fix error when calling remove with no args ([#1657](https://github.com/mongodb/node-mongodb-native/issues/1657)) ([4c9b0f8](https://github.com/mongodb/node-mongodb-native/commit/4c9b0f8))
* **executeOperation:** don't mutate options passed to commands ([934a43a](https://github.com/mongodb/node-mongodb-native/commit/934a43a))
* **jsdoc:** mark db.collection callback as optional + typo fix ([#1658](https://github.com/mongodb/node-mongodb-native/issues/1658)) ([c519b9b](https://github.com/mongodb/node-mongodb-native/commit/c519b9b))
* **sessions:** move active session tracking to topology base ([#1665](https://github.com/mongodb/node-mongodb-native/issues/1665)) ([b1f296f](https://github.com/mongodb/node-mongodb-native/commit/b1f296f))



<a name="3.0.2"></a>
## [3.0.2](https://github.com/mongodb/node-mongodb-native/compare/v3.0.1...v3.0.2) (2018-01-29)


### Bug Fixes

* **collection:** ensure dynamic require of `db` is wrapped in parentheses ([efa78f0](https://github.com/mongodb/node-mongodb-native/commit/efa78f0))
* **db:** only callback with MongoError NODE-1293 ([#1652](https://github.com/mongodb/node-mongodb-native/issues/1652)) ([45bc722](https://github.com/mongodb/node-mongodb-native/commit/45bc722))
* **topology base:** allow more than 10 event listeners ([#1630](https://github.com/mongodb/node-mongodb-native/issues/1630)) ([d9fb750](https://github.com/mongodb/node-mongodb-native/commit/d9fb750))
* **url parser:** preserve auth creds when composing conn string  ([#1640](https://github.com/mongodb/node-mongodb-native/issues/1640)) ([eddca5e](https://github.com/mongodb/node-mongodb-native/commit/eddca5e))


### Features

* **bulk:** forward 'checkKeys' option for ordered and unordered bulk operations ([421a6b2](https://github.com/mongodb/node-mongodb-native/commit/421a6b2))
* **collection:** expose `dbName` property of collection ([6fd05c1](https://github.com/mongodb/node-mongodb-native/commit/6fd05c1))



<a name="3.0.1"></a>
## [3.0.1](https://github.com/mongodb/node-mongodb-native/compare/v3.0.0...v3.0.1) (2017-12-24)

* update mongodb-core to 3.0.1

<a name="3.0.0"></a>
# [3.0.0](https://github.com/mongodb/node-mongodb-native/compare/v3.0.0-rc0...v3.0.0) (2017-12-24)


### Bug Fixes

* **aggregate:** remove support for inline results for aggregate ([#1620](https://github.com/mongodb/node-mongodb-native/issues/1620)) ([84457ec](https://github.com/mongodb/node-mongodb-native/commit/84457ec))
* **topologies:** unify topologies connect API ([#1615](https://github.com/mongodb/node-mongodb-native/issues/1615)) ([0fb4658](https://github.com/mongodb/node-mongodb-native/commit/0fb4658))


### Features

* **keepAlive:** make keepAlive options consistent ([#1612](https://github.com/mongodb/node-mongodb-native/issues/1612)) ([f608f44](https://github.com/mongodb/node-mongodb-native/commit/f608f44))


### BREAKING CHANGES

* **topologies:** Function signature for `.connect` method on replset and mongos has changed. You shouldn't have been using this anyway, but if you were, you only should pass `options` and `callback`.

Part of NODE-1089
* **keepAlive:** option `keepAlive` is now split into boolean `keepAlive` and
number `keepAliveInitialDelay`

Fixes NODE-998



<a name="3.0.0-rc0"></a>
# [3.0.0-rc0](https://github.com/mongodb/node-mongodb-native/compare/v2.2.31...v3.0.0-rc0) (2017-12-05)


### Bug Fixes

* **aggregation:** ensure that the `cursor` key is always present ([f16f314](https://github.com/mongodb/node-mongodb-native/commit/f16f314))
* **apm:** give users access to raw server responses ([88b206b](https://github.com/mongodb/node-mongodb-native/commit/88b206b))
* **apm:** only rebuilt cursor if reply is non-null ([96052c8](https://github.com/mongodb/node-mongodb-native/commit/96052c8))
* **apm:** rebuild lost `cursor` info on pre-OP_QUERY responses ([4242d49](https://github.com/mongodb/node-mongodb-native/commit/4242d49))
* **bulk-unordered:** add check for ignoreUndefined ([f38641a](https://github.com/mongodb/node-mongodb-native/commit/f38641a))
* **change stream examples:** use timeouts, cleanup ([c5fec5f](https://github.com/mongodb/node-mongodb-native/commit/c5fec5f))
* **change-streams:** ensure a majority read concern on initial agg ([23011e9](https://github.com/mongodb/node-mongodb-native/commit/23011e9))
* **changeStreams:** fixing node4 issue with util.inherits ([#1587](https://github.com/mongodb/node-mongodb-native/issues/1587)) ([168bb3d](https://github.com/mongodb/node-mongodb-native/commit/168bb3d))
* **collection:** allow { upsert: 1 } for findOneAndUpdate() and update() ([5bcedd6](https://github.com/mongodb/node-mongodb-native/commit/5bcedd6))
* **collection:** allow passing `noCursorTimeout` as an option to `find()` ([e9c4ffc](https://github.com/mongodb/node-mongodb-native/commit/e9c4ffc))
* **collection:** make the parameters of findOne very explicit ([3054f1a](https://github.com/mongodb/node-mongodb-native/commit/3054f1a))
* **cursor:** `hasNext` should propagate errors when using callback ([6339625](https://github.com/mongodb/node-mongodb-native/commit/6339625))
* **cursor:** close readable on `null` response for dead cursor ([6aca2c5](https://github.com/mongodb/node-mongodb-native/commit/6aca2c5))
* **dns txt records:** check options are set ([e5caf4f](https://github.com/mongodb/node-mongodb-native/commit/e5caf4f))
* **docs:** Represent each valid option in docs in both places ([fde6e5d](https://github.com/mongodb/node-mongodb-native/commit/fde6e5d))
* **grid-store:** add missing callback ([66a9a05](https://github.com/mongodb/node-mongodb-native/commit/66a9a05))
* **grid-store:** move into callback scope ([b53f65f](https://github.com/mongodb/node-mongodb-native/commit/b53f65f))
* **GridFS:**  fix TypeError: doc.data.length is not a function ([#1570](https://github.com/mongodb/node-mongodb-native/issues/1570)) ([22a4628](https://github.com/mongodb/node-mongodb-native/commit/22a4628))
* **list-collections:** ensure default of primary ReadPreference ([4a0cfeb](https://github.com/mongodb/node-mongodb-native/commit/4a0cfeb))
* **mongo client:** close client before calling done ([c828aab](https://github.com/mongodb/node-mongodb-native/commit/c828aab))
* **mongo client:** do not connect if url parse error ([cd10084](https://github.com/mongodb/node-mongodb-native/commit/cd10084))
* **mongo client:** send error to cb ([eafc9e2](https://github.com/mongodb/node-mongodb-native/commit/eafc9e2))
* **mongo-client:** move to inside of callback ([68b0fca](https://github.com/mongodb/node-mongodb-native/commit/68b0fca))
* **mongo-client:** options should not be passed to `connect` ([474ac65](https://github.com/mongodb/node-mongodb-native/commit/474ac65))
* **tests:** migrate 2.x tests to 3.x ([3a5232a](https://github.com/mongodb/node-mongodb-native/commit/3a5232a))
* **updateOne/updateMany:** ensure that update documents contain atomic operators ([8b4255a](https://github.com/mongodb/node-mongodb-native/commit/8b4255a))
* **url parser:** add check for options as cb ([52b6039](https://github.com/mongodb/node-mongodb-native/commit/52b6039))
* **url parser:** compare srv address and parent domains ([daa186d](https://github.com/mongodb/node-mongodb-native/commit/daa186d))
* **url parser:** compare string from first period on ([9e5d77e](https://github.com/mongodb/node-mongodb-native/commit/9e5d77e))
* **url parser:** default to ssl true for mongodb+srv ([0fbca4b](https://github.com/mongodb/node-mongodb-native/commit/0fbca4b))
* **url parser:** error when multiple hostnames used ([c1aa681](https://github.com/mongodb/node-mongodb-native/commit/c1aa681))
* **url parser:** keep original uri options and default to ssl true ([e876a72](https://github.com/mongodb/node-mongodb-native/commit/e876a72))
* **url parser:** log instead of throw error for unsupported url options ([155de2d](https://github.com/mongodb/node-mongodb-native/commit/155de2d))
* **url parser:** make sure uri has 3 parts ([aa9871b](https://github.com/mongodb/node-mongodb-native/commit/aa9871b))
* **url parser:** only 1 txt record allowed with 2 possible options ([d9f4218](https://github.com/mongodb/node-mongodb-native/commit/d9f4218))
* **url parser:** only check for multiple hostnames with srv protocol ([5542bcc](https://github.com/mongodb/node-mongodb-native/commit/5542bcc))
* **url parser:** remove .only from test ([642e39e](https://github.com/mongodb/node-mongodb-native/commit/642e39e))
* **url parser:** return callback ([6096afc](https://github.com/mongodb/node-mongodb-native/commit/6096afc))
* **url parser:** support single text record with multiple strings ([356fa57](https://github.com/mongodb/node-mongodb-native/commit/356fa57))
* **url parser:** try catch bug, not actually returning from try loop ([758892b](https://github.com/mongodb/node-mongodb-native/commit/758892b))
* **url parser:** use warn instead of info ([40ed27d](https://github.com/mongodb/node-mongodb-native/commit/40ed27d))
* **url-parser:** remove comment, send error to cb ([d44420b](https://github.com/mongodb/node-mongodb-native/commit/d44420b))


### Features

* **aggregate:** support hit field for aggregate command ([aa7da15](https://github.com/mongodb/node-mongodb-native/commit/aa7da15))
* **aggregation:** adds support for comment in aggregation command ([#1571](https://github.com/mongodb/node-mongodb-native/issues/1571)) ([4ac475c](https://github.com/mongodb/node-mongodb-native/commit/4ac475c))
* **aggregation:** fail aggregation on explain + readConcern/writeConcern ([e0ca1b4](https://github.com/mongodb/node-mongodb-native/commit/e0ca1b4))
* **causal-consistency:** support `afterClusterTime` in readConcern ([a9097f7](https://github.com/mongodb/node-mongodb-native/commit/a9097f7))
* **change-streams:** add support for change streams ([c02d25c](https://github.com/mongodb/node-mongodb-native/commit/c02d25c))
* **collection:** updating find API ([f26362d](https://github.com/mongodb/node-mongodb-native/commit/f26362d))
* **execute-operation:** implementation for common op execution ([67c344f](https://github.com/mongodb/node-mongodb-native/commit/67c344f))
* **listDatabases:** add support for nameOnly option to listDatabases ([eb79b5a](https://github.com/mongodb/node-mongodb-native/commit/eb79b5a))
* **maxTimeMS:** adding maxTimeMS option to createIndexes and dropIndexes ([90d4a63](https://github.com/mongodb/node-mongodb-native/commit/90d4a63))
* **mongo-client:** implement `MongoClient.prototype.startSession` ([bce5adf](https://github.com/mongodb/node-mongodb-native/commit/bce5adf))
* **retryable-writes:** add support for `retryWrites` cs option ([2321870](https://github.com/mongodb/node-mongodb-native/commit/2321870))
* **sessions:** MongoClient will now track sessions and release ([6829f47](https://github.com/mongodb/node-mongodb-native/commit/6829f47))
* **sessions:** support passing sessions via objects in all methods ([a531f05](https://github.com/mongodb/node-mongodb-native/commit/a531f05))
* **shared:** add helper utilities for assertion and suite setup ([b6cc34e](https://github.com/mongodb/node-mongodb-native/commit/b6cc34e))
* **ssl:** adds missing ssl options ssl options for `ciphers` and `ecdhCurve` ([441b7b1](https://github.com/mongodb/node-mongodb-native/commit/441b7b1))
* **test-shared:** add `notEqual` assertion ([41d93fd](https://github.com/mongodb/node-mongodb-native/commit/41d93fd))
* **test-shared:** add `strictEqual` assertion method ([cad8e19](https://github.com/mongodb/node-mongodb-native/commit/cad8e19))
* **topologies:** expose underlaying `logicalSessionTimeoutMinutes' ([1609a37](https://github.com/mongodb/node-mongodb-native/commit/1609a37))
* **url parser:** better error message for slash in hostname ([457bc29](https://github.com/mongodb/node-mongodb-native/commit/457bc29))


### BREAKING CHANGES

* **aggregation:** If you use aggregation, and try to use the explain flag while you
have a readConcern or writeConcern, your query will fail
* **collection:** `find` and `findOne` no longer support the `fields` parameter.
You can achieve the same results as the `fields` parameter by
either using `Cursor.prototype.project`, or by passing the `projection`
property in on the `options` object. Additionally, `find` does not
support individual options like `skip` and `limit` as positional
parameters. You must pass in these parameters in the `options` object



3.0.0 2017-??-??
----------------
* NODE-1043 URI-escaping authentication and hostname details in connection string

2.2.31 2017-08-08
-----------------
* update mongodb-core to 2.2.15
* allow auth option in MongoClient.connect
* remove duplicate option `promoteLongs` from MongoClient's `connect`
* bulk operations should not throw an error on empty batch

2.2.30 2017-07-07
-----------------
* Update mongodb-core to 2.2.14
* MongoClient
  * add `appname` to list of valid option names
  * added test for passing appname as option
* NODE-1052 ensure user options are applied while parsing connection string uris

2.2.29 2017-06-19
-----------------
* Update mongodb-core to 2.1.13
  * NODE-1039 ensure we force destroy server instances, forcing queue to be flushed.
  *  Use actual server type in standalone SDAM events.
* Allow multiple map calls (Issue #1521, https://github.com/Robbilie).
* Clone insertMany options before mutating (Issue #1522, https://github.com/vkarpov15).
* NODE-1034 Fix GridStore issue caused by Node 8.0.0 breaking backward compatible fs.read API.
* NODE-1026, use  operator instead of skip function in order to avoid useless fetch stage.

2.2.28 2017-06-02
-----------------
* Update mongodb-core to 2.1.12
  * NODE-1019 Set keepAlive to 300 seconds or 1/2 of socketTimeout if socketTimeout < keepAlive.
  * Minor fix to report the correct state on error.
  * NODE-1020 'family' was added to options to provide high priority for ipv6 addresses (Issue #1518, https://github.com/firej).
  * Fix require_optional loading of bson-ext.
  * Ensure no errors are thrown by replset if topology is destroyed before it finished connecting.
  * NODE-999 SDAM fixes for Mongos and single Server event emitting.
  * NODE-1014 Set socketTimeout to default to 360 seconds.
  * NODE-1019 Set keepAlive to 300 seconds or 1/2 of socketTimeout if socketTimeout < keepAlive.
* Just handle Collection name errors distinctly from general callback errors avoiding double callbacks in Db.collection.
* NODE-999 SDAM fixes for Mongos and single Server event emitting.
* NODE-1000 Added guard condition for upload.js checkDone function in case of race condition caused by late arriving chunk write.

2.2.27 2017-05-22
-----------------
* Updated mongodb-core to 2.1.11
    * NODE-987 Clear out old intervalIds on when calling topologyMonitor.
    * NODE-987 Moved filtering to pingServer method and added test case.
    * Check for connection destroyed just before writing out and flush out operations correctly if it is (Issue #179, https://github.com/jmholzinger).
    * NODE-989 Refactored Replicaset monitoring to correcly monitor newly added servers, Also extracted setTimeout and setInterval to use custom wrappers Timeout and Interval.
* NODE-985 Deprecated Db.authenticate and Admin.authenticate and moved auth methods into authenticate.js to ensure MongoClient.connect does not print deprecation warnings.
* NODE-988 Merged readConcern and hint correctly on collection(...).find(...).count()
* Fix passing the readConcern option to MongoClient.connect (Issue #1514, https://github.com/bausmeier).
* NODE-996 Propegate all events up to a MongoClient instance.
* Allow saving doc with null `_id` (Issue #1517, https://github.com/vkarpov15).
* NODE-993 Expose hasNext for command cursor and add docs for both CommandCursor and Aggregation Cursor.

2.2.26 2017-04-18
-----------------
* Updated mongodb-core to 2.1.10
    * NODE-981 delegate auth to replset/mongos if inTopology is set.
    * NODE-978 Wrap connection.end in try/catch for node 0.10.x issue causing exceptions to be thrown, Also surfaced getConnection for mongos and replset.
    * Remove dynamic require (Issue #175, https://github.com/tellnes).
    * NODE-696 Handle interrupted error for createIndexes.
    * Fixed isse when user is executing find command using Server.command and it get interpreted as a wire protcol message, #172.
    * NODE-966 promoteValues not being promoted correctly to getMore.
    * Merged in fix for flushing out monitoring operations.
* NODE-983 Add cursorId to aggregate and listCollections commands (Issue, #1510).
* Mark group and profilingInfo as deprecated methods
* NODE-956 DOCS Examples.
* Update readable-stream to version 2.2.7.
* NODE-978 Added test case to uncover connection.end issue for node 0.10.x.
* NODE-972 Fix(db): don't remove database name if collectionName == dbName (Issue, #1502)
* Fixed merging of writeConcerns on db.collection method.
* NODE-970 mix in readPreference for strict mode listCollections callback.
* NODE-966 added testcase for promoteValues being applied to getMore commands.
* NODE-962 Merge in ignoreUndefined from collection level for find/findOne.
* Remove multi option from updateMany tests/docs (Issue #1499, https://github.com/spratt).
* NODE-963 Correctly handle cursor.count when using APM.

2.2.25 2017-03-17
-----------------
* Don't rely on global toString() for checking if object (Issue #1494, https://github.com/vkarpov15).
* Remove obsolete option uri_decode_auth (Issue #1488, https://github.com/kamagatos).
* NODE-936 Correctly translate ReadPreference to CoreReadPreference for mongos queries.
* Exposed BSONRegExp type.
* NODE-950 push correct index for INSERT ops (https://github.com/mbroadst).
* NODE-951 Added support for sslCRL option and added a test case for it.
* NODE-953 Made batchSize issue general at cursor level.
* NODE-954 Remove write concern from reindex helper as it will not be supported in 3.6.
* Updated mongodb-core to 2.1.9.
    * Return lastIsMaster correctly when connecting with secondaryOnlyConnectionAllowed is set to true and only a secondary is available in replica state.
    * Clone options when passed to wireProtocol handler to avoid intermittent modifications causing errors.
    * Ensure SSL error propegates better for Replset connections when there is a SSL validation error.
    * NODE-957 Fixed issue where < batchSize not causing cursor to be closed on execution of first batch.
    * NODE-958 Store reconnectConnection on pool object to allow destroy to close immediately.

2.2.24 2017-02-14
-----------------
* NODE-935, NODE-931 Make MongoClient strict options validation optional and instead print annoying console.warn entries.

2.2.23 2017-02-13
-----------------
* Updated mongodb-core to 2.1.8.
  * NODE-925 ensure we reschedule operations while pool is < poolSize while pool is growing and there are no connections with not currently performing work.
  * NODE-927 fixes issue where authentication was performed against arbiter instances.
  * NODE-915 Normalize all host names to avoid comparison issues.
  * Fixed issue where pool.destroy would never finish due to a single operation not being executed and keeping it open.
* NODE-931 Validates all the options for MongoClient.connect and fixes missing connection settings.
* NODE-929 Update SSL tutorial to correctly reflect the non-need for server/mongos/replset subobjects
* Fix sensitive command check (Issue #1473, https://github.com/Annoraaq)

2.2.22 2017-01-24
-----------------
* Updated mongodb-core to 2.1.7.
  * NODE-919 ReplicaSet connection does not close immediately (Issue #156).
  * NODE-901 Fixed bug when normalizing host names.
  * NODE-909 Fixed readPreference issue caused by direct connection to primary.
  * NODE-910 Fixed issue when bufferMaxEntries == 0 and read preference set to nearest.
* Add missing unref implementations for replset, mongos (Issue #1455, https://github.com/zbjornson)

2.2.21 2017-01-13
-----------------
* Updated mongodb-core to 2.1.6.
  * NODE-908 Keep auth contexts in replset and mongos topology to ensure correct application of authentication credentials when primary is first server to be detected causing an immediate connect event to happen.

2.2.20 2017-01-11
-----------------
* Updated mongodb-core to 2.1.5 to include bson 1.0.4 and bson-ext 1.0.4 due to Buffer.from being broken in early node 4.x versions.

2.2.19 2017-01-03
-----------------
* Corrupted Npm release fix.

2.2.18 2017-01-03
-----------------
* Updated mongodb-core to 2.1.4 to fix bson ObjectId toString issue with utils.inspect messing with toString parameters in node 6.

2.2.17 2017-01-02
-----------------
* updated createCollection doc options and linked to create command.
* Updated mongodb-core to 2.1.3.
  * Monitoring operations are re-scheduled in pool if it cannot find a connection that does not already have scheduled work on it, this is to avoid the monitoring socket timeout being applied to any existing operations on the socket due to pipelining
  * Moved replicaset monitoring away from serial mode and to parallel mode.
  * updated bson and bson-ext dependencies to 1.0.2.

2.2.16 2016-12-13
-----------------
* NODE-899 reversed upsertedId change to bring back old behavior.

2.2.15 2016-12-10
-----------------
* Updated mongodb-core to 2.1.2.
  * Delay topologyMonitoring on successful attemptReconnect as no need to run a full scan immediately.
  * Emit reconnect event in primary joining when in connected status for a replicaset (Fixes mongoose reconnect issue).

2.2.14 2016-12-08
-----------------
* Updated mongodb-core to 2.1.1.
* NODE-892 Passthrough options.readPreference to mongodb-core ReplSet instance.

2.2.13 2016-12-05
-----------------
* Updated mongodb-core to 2.1.0.
* NODE-889 Fixed issue where legacy killcursor wire protocol messages would not be sent when APM is enabled.
* Expose parserType as property on topology objects.

2.2.12 2016-11-29
-----------------
* Updated mongodb-core to 2.0.14.
  * Updated bson library to 0.5.7.
  * Dont leak connection.workItems elments when killCursor is called (Issue #150, https://github.com/mdlavin).
  * Remove unnecessary errors formatting (Issue #149, https://github.com/akryvomaz).
  * Only check isConnected against availableConnections (Issue #142).
  * NODE-838 Provide better error message on failed to connect on first retry for Mongos topology.
  * Set default servername to host is not passed through for sni.
  * Made monitoring happen on exclusive connection and using connectionTimeout to handle the wait time before failure (Issue #148).
  * NODE-859 Make minimum value of maxStalenessSeconds 90 seconds.
  * NODE-852 Fix Kerberos module deprecations on linux and windows and release new kerberos version.
  * NODE-850 Update Max Staleness implementation.
  * NODE-849 username no longer required for MONGODB-X509 auth.
  * NODE-848 BSON Regex flags must be alphabetically ordered.
  * NODE-846 Create notice for all third party libraries.
  * NODE-843 Executing bulk operations overwrites write concern parameter.
  * NODE-842 Re-sync SDAM and SDAM Monitoring tests from Specs repo.
  * NODE-840 Resync CRUD spec tests.
  * Unescapable while(true) loop (Issue #152).
* NODE-864 close event not emits during network issues using single server topology.
* Introduced maxStalenessSeconds.
* NODE-840 Added CRUD specification test cases and fix minor issues with upserts reporting matchedCount > 0.
* Don't ignore Db-level authSource when using auth method.  (https://github.com/donaldguy).

2.2.11 2016-10-21
-----------------
* Updated mongodb-core to 2.0.13.
  - Fire callback when topology was destroyed (Issue #147, https://github.com/vkarpov15).
  - Refactoring to support pipelining ala 1.4.x branch will retaining the benefits of the growing/shrinking pool (Issue #146).
  - Fix typo in serverHeartbeatFailed event name (Issue #143, https://github.com/jakesjews).
  - NODE-798 Driver hangs on count command in replica set with one member (Issue #141, https://github.com/isayme).
* Updated bson library to 0.5.6.
  - Included cyclic dependency detection
* Fix typo in serverHeartbeatFailed event name (Issue #1418, https://github.com/jakesjews).
* NODE-824, readPreference "nearest" does not work when specified at collection level.
* NODE-822, GridFSBucketWriteStream end method does not handle optional parameters.
* NODE-823, GridFSBucketWriteStream end: callback is invoked with invalid parameters.
* NODE-829, Using Start/End offset option in GridFSBucketReadStream doesn't return the right sized buffer.

2.2.10 2016-09-15
-----------------
* Updated mongodb-core to 2.0.12.
* fix debug logging message not printing server name.
* fixed application metadata being sent by wrong ismaster.
* NODE-812 Fixed mongos stall due to proxy monitoring ismaster failure causing reconnect.
* NODE-818 Replicaset timeouts in initial connect sequence can "no primary found".
* Updated bson library to 0.5.5.
* Added DBPointer up conversion to DBRef.
* MongoDB 3.4-RC Pass **appname** through MongoClient.connect uri or options to allow metadata to be passed.
* MongoDB 3.4-RC Pass collation options on update, findOne, find, createIndex, aggregate.
* MongoDB 3.4-RC Allow write concerns to be passed to all supporting server commands.
* MongoDB 3.4-RC Allow passing of **servername** as SSL options to support SNI.

2.2.9 2016-08-29
----------------
* Updated mongodb-core to 2.0.11.
* NODE-803, Fixed issue in how the latency window is calculated for Mongos topology causing issues for single proxy connections.
* Avoid timeout in attemptReconnect causing multiple attemptReconnect attempts to happen (Issue #134, https://github.com/dead-horse).
* Ensure promoteBuffers is propegated in same fashion as promoteValues and promoteLongs.
* Don't treat ObjectId as object for mapReduce scope (Issue #1397, https://github.com/vkarpov15).

2.2.8 2016-08-23
----------------
* Updated mongodb-core to 2.0.10.
* Added promoteValues flag (default to true) to allow user to specify they only want wrapped BSON values back instead of promotion to native types.
* Do not close mongos proxy connection on failed ismaster check in ha process (Issue #130).

2.2.7 2016-08-19
----------------
* If only a single mongos is provided in the seedlist, fix issue where it would be assigned as single standalone server instead of mongos topology (Issue #130).
* Updated mongodb-core to 2.0.9.
* Allow promoteLongs to be passed in through Response.parse method and overrides default set on the connection.
* NODE-798 Driver hangs on count command in replica set with one member.
* Allow promoteLongs to be passed in through Response.parse method and overrides default set on the connection.
* Allow passing in servername for TLS connections for SNI support.

2.2.6 2016-08-16
----------------
* Updated mongodb-core to 2.0.8.
* Allow execution of store operations independent of having both a primary and secondary available (Issue #123).
* Fixed command execution issue for mongos to ensure buffering of commands when no mongos available.
* Allow passing in an array of tags to ReadPreference constructor (Issue #1382, https://github.com/vkarpov15)
* Added hashed connection names and fullResult.
* Updated bson library to 0.5.3.
* Enable maxTimeMS in count, distinct, findAndModify.

2.2.5 2016-07-28
----------------
* Updated mongodb-core to 2.0.7.
* Allow primary to be returned when secondaryPreferred is passed (Issue #117, https://github.com/dhendo).
* Added better warnings when passing in illegal seed list members to a Mongos topology.
* Minor attemptReconnect bug that would cause multiple attemptReconnect to run in parallel.
* Fix wrong opType passed to disconnectHandler.add (Issue #121, https://github.com/adrian-gierakowski)
* Implemented domain backward comp support enabled via domainsEnabled options on Server/ReplSet/Mongos and MongoClient.connect.

2.2.4 2016-07-19
----------------
* NPM corrupted upload fix.

2.2.3 2016-07-19
----------------
* Updated mongodb-core to 2.0.6.
* Destroy connection on socket timeout due to newer node versions not closing the socket.

2.2.2 2016-07-15
----------------
* Updated mongodb-core to 2.0.5.
* Minor fixes to handle faster MongoClient connectivity from the driver, allowing single server instances to detect if they are a proxy.
* Added numberOfConsecutiveTimeouts to pool that will destroy the pool if the number of consecutive timeouts > reconnectTries.
* Print warning if seedlist servers host name does not match the one provided in it's ismaster.me field for Replicaset members.
* Fix issue where Replicaset connection would not succeeed if there the replicaset was a single primary server setup.

2.2.1 2016-07-11
----------------
* Updated mongodb-core to 2.0.4.
* handle situation where user is providing seedlist names that do not match host list. fix allows for a single full discovery connection sweep before erroring out.
* NODE-747 Polyfill for Object.assign for 0.12.x or 0.10.x.
* NODE-746 Improves replicaset errors for wrong setName.

2.2.0 2016-07-05
----------------
* Updated mongodb-core to 2.0.3.
* Moved all authentication and handling of growing/shrinking of pool connections into actual pool.
* All authentication methods now handle both auth/reauthenticate and logout events.
* Introduced logout method to get rid of onAll option for logout command.
* Updated bson to 0.5.0 that includes Decimal128 support.
* Fixed logger error serialization issue.
* Documentation fixes.
* Implemented Server Selection Specification test suite.
* Added warning level to logger.
* Added warning message when sockeTimeout < haInterval for Replset/Mongos.
* Mongos emits close event on no proxies available or when reconnect attempt fails.
* Replset emits close event when no servers available or when attemptReconnect fails to reconnect.
* Don't throw in auth methods but return error in callback.

2.1.21 2016-05-30
-----------------
* Updated mongodb-core to 1.3.21.
* Pool gets stuck if a connection marked for immediateRelease times out (Issue #99, https://github.com/nbrachet).
* Make authentication process retry up to authenticationRetries at authenticationRetryIntervalMS interval.
* Made ismaster replicaset calls operate with connectTimeout or monitorSocketTimeout to lower impact of big socketTimeouts on monitoring performance.
* Make sure connections mark as "immediateRelease" don't linger the inUserConnections list. Otherwise, after that connection times out, getAll() incorrectly returns more connections than are effectively present, causing the pool to not get restarted by reconnectServer. (Issue #99, https://github.com/nbrachet).
* Make cursor getMore or killCursor correctly trigger pool reconnect to single server if pool has not been destroyed.
* Make ismaster monitoring for single server connection default to avoid user confusion due to change in behavior.

2.1.20 2016-05-25
-----------------
* Refactored MongoClient options handling to simplify the logic, unifying it.
* NODE-707 Implemented openUploadStreamWithId on GridFS to allow for custom fileIds so users are able to customize shard key and shard distribution.
* NODE-710 Allow setting driver loggerLevel and logger function from MongoClient options.
* Updated mongodb-core to 1.3.20.
* Minor fix for SSL errors on connection attempts, minor fix to reconnect handler for the server.
* Don't write to socket before having registered the callback for commands, work around for windows issuing error events twice on node.js when socket gets destroyed by firewall.
* Fix minor issue where connectingServers would not be removed correctly causing single server connections to not auto-reconnect.

2.1.19 2016-05-17
----------------
* Handle situation where a server connection in a replicaset sometimes fails to be destroyed properly due to being in the middle of authentication when the destroy method is called on the replicaset causing it to be orphaned and never collected.
* Ensure replicaset topology destroy is never called by SDAM.
* Ensure all paths are correctly returned on inspectServer in replset.
* Updated mongodb-core to 1.3.19 to fix minor connectivity issue on quick open/close of MongoClient connections on auth enabled mongodb Replicasets.

2.1.18 2016-04-27
-----------------
* Updated mongodb-core to 1.3.18 to fix Node 6.0 issues.

2.1.17 2016-04-26
-----------------
* Updated mongodb-core to 1.3.16 to work around issue with early versions of node 0.10.x due to missing unref method on ClearText streams.
* INT-1308: Allow listIndexes to inherit readPreference from Collection or DB.
* Fix timeout issue using new flags #1361.
* Updated mongodb-core to 1.3.17.
* Better handling of unique createIndex error.
* Emit error only if db instance has an error listener.
* DEFAULT authMechanism; don't throw error if explicitly set by user.

2.1.16 2016-04-06
-----------------
* Updated mongodb-core to 1.3.16.

2.1.15 2016-04-06
-----------------
* Updated mongodb-core to 1.3.15.
* Set ssl, sslValidate etc to mongosOptions on url_parser (Issue #1352, https://github.com/rubenstolk).
- NODE-687 Fixed issue where a server object failed to be destroyed if the replicaset state did not update successfully. This could leave active connections accumulating over time.
- Fixed some situations where all connections are flushed due to a single connection in the connection pool closing.

2.1.14 2016-03-29
-----------------
* Updated mongodb-core to 1.3.13.
* Handle missing cursor on getMore when going through a mongos proxy by pinning to socket connection and not server.

2.1.13 2016-03-29
-----------------
* Updated mongodb-core to 1.3.12.

2.1.12 2016-03-29
-----------------
* Updated mongodb-core to 1.3.11.
* Mongos setting acceptableLatencyMS exposed to control the latency women for mongos selection.
* Mongos pickProxies fall back to closest mongos if no proxies meet latency window specified.
* isConnected method for mongos uses same selection code as getServer.
* Exceptions in cursor getServer trapped and correctly delegated to high level handler.

2.1.11 2016-03-23
-----------------
* Updated mongodb-core to 1.3.10.
* Introducing simplified connections settings.

2.1.10 2016-03-21
-----------------
* Updated mongodb-core to 1.3.9.
* Fixing issue that prevented mapReduce stats from being resolved (Issue #1351, https://github.com/davidgtonge)
* Forwards SDAM monitoring events from mongodb-core.

2.1.9 2016-03-16
----------------
* Updated mongodb-core to 1.3.7 to fix intermittent race condition that causes some users to experience big amounts of socket connections.
* Makde bson parser in ordered/unordered bulk be directly from mongodb-core to avoid intermittent null error on mongoose.

2.1.8 2016-03-14
----------------
* Updated mongodb-core to 1.3.5.
* NODE-660 TypeError: Cannot read property 'noRelease' of undefined.
* Harden MessageHandler in server.js to avoid issues where we cannot find a callback for an operation.
* Ensure RequestId can never be larger than Max Number integer size.
* NODE-661 typo in url_parser.js resulting in replSetServerOptions is not defined when connecting over ssl.
* Confusing error with invalid partial index filter (Issue #1341, https://github.com/vkarpov15).
* NODE-669 Should only error out promise for bulkWrite when error is a driver level error not a write error or write concern error.
* NODE-662 shallow copy options on methods that are not currently doing it to avoid passed in options mutiation.
* NODE-663 added lookup helper on aggregation cursor.
* NODE-585 Result object specified incorrectly for findAndModify?.
* NODE-666 harden validation for findAndModify CRUD methods.

2.1.7 2016-02-09
----------------
* NODE-656 fixed corner case where cursor count command could be left without a connection available.
* NODE-658 Work around issue that bufferMaxEntries:-1 for js gets interpreted wrongly due to double nature of Javascript numbers.
* Fix: GridFS always returns the oldest version due to incorrect field name (Issue #1338, https://github.com/mdebruijne).
* NODE-655 GridFS stream support for cancelling upload streams and download streams (Issue #1339, https://github.com/vkarpov15).
* NODE-657 insertOne don`t return promise in some cases.
* Added destroy alias for abort function on GridFSBucketWriteStream.

2.1.6 2016-02-05
----------------
* Updated mongodb-core to 1.3.1.

2.1.5 2016-02-04
----------------
* Updated mongodb-core to 1.3.0.
* Added raw support for the command function on topologies.
* Fixed issue where raw results that fell on batchSize boundaries failed (Issue #72)
* Copy over all the properties to the callback returned from bindToDomain, (Issue #72)
* Added connection hash id to be able to reference connection host/name without leaking it outside of driver.
* NODE-638, Cannot authenticate database user with utf-8 password.
* Refactored pool to be worker queue based, minimizing the impact a slow query have on throughput as long as # slow queries < # connections in the pool.
* Pool now grows and shrinks correctly depending on demand not causing a full pool reconnect.
* Improvements in monitoring of a Replicaset where in certain situations the inquiry process could get exited.
* Switched to using Array.push instead of concat for use cases of a lot of documents.
* Fixed issue where re-authentication could loose the credentials if whole Replicaset disconnected at once.
* Added peer optional dependencies support using require_optional module.
* Bug is listCollections for collection names that start with db name (Issue #1333, https://github.com/flyingfisher)
* Emit error before closing stream (Issue #1335, https://github.com/eagleeye)

2.1.4 2016-01-12
----------------
* Restricted node engine to >0.10.3 (https://jira.mongodb.org/browse/NODE-635).
* Multiple database names ignored without a warning (https://jira.mongodb.org/browse/NODE-636, Issue #1324, https://github.com/yousefhamza).
* Convert custom readPreference objects in collection.js (Issue #1326, https://github.com/Machyne).

2.1.3 2016-01-04
----------------
* Updated mongodb-core to 1.2.31.
* Allow connection to secondary if primaryPreferred or secondaryPreferred (Issue #70, https://github.com/leichter)

2.1.2 2015-12-23
----------------
* Updated mongodb-core to 1.2.30.
* Pool allocates size + 1 connections when using replicasets, reserving additional pool connection for monitoring exclusively.
* Fixes bug when all replicaset members are down, that would cause it to fail to reconnect using the originally provided seedlist.

2.1.1 2015-12-13
----------------
* Surfaced checkServerIdentity options for MongoClient, Server, ReplSet and Mongos to allow for control of the checkServerIdentity method available in Node.s 0.12.x or higher.
* Added readPreference support to listCollections and listIndexes helpers.
* Updated mongodb-core to 1.2.28.

2.1.0 2015-12-06
----------------
* Implements the connection string specification, https://github.com/mongodb/specifications/blob/master/source/connection-string/connection-string-spec.rst.
* Implements the new GridFS specification, https://github.com/mongodb/specifications/blob/master/source/gridfs/gridfs-spec.rst.
* Full MongoDB 3.2 support.
* NODE-601 Added maxAwaitTimeMS support for 3.2 getMore to allow for custom timeouts on tailable cursors.
* Updated mongodb-core to 1.2.26.
* Return destination in GridStore pipe function.
* NODE-606 better error handling on destroyed topology for db.js methods.
* Added isDestroyed method to server, replset and mongos topologies.
* Upgraded test suite to run using mongodb-topology-manager.

2.0.53 2015-12-23
-----------------
* Updated mongodb-core to 1.2.30.
* Pool allocates size + 1 connections when using replicasets, reserving additional pool connection for monitoring exclusively.
* Fixes bug when all replicaset members are down, that would cause it to fail to reconnect using the originally provided seedlist.

2.0.52 2015-12-14
-----------------
* removed remove from Gridstore.close.

2.0.51 2015-12-13
-----------------
* Surfaced checkServerIdentity options for MongoClient, Server, ReplSet and Mongos to allow for control of the checkServerIdentity method available in Node.s 0.12.x or higher.
* Added readPreference support to listCollections and listIndexes helpers.
* Updated mongodb-core to 1.2.28.

2.0.50 2015-12-06
-----------------
* Updated mongodb-core to 1.2.26.

2.0.49 2015-11-20
-----------------
* Updated mongodb-core to 1.2.24 with several fixes.
  * Fix Automattic/mongoose#3481; flush callbacks on error, (Issue #57, https://github.com/vkarpov15).
  * $explain query for wire protocol 2.6 and 2.4 does not set number of returned documents to -1 but to 0.
  * ismaster runs against admin.$cmd instead of system.$cmd.
  * Fixes to handle getMore command errors for MongoDB 3.2
  * Allows the process to properly close upon a Db.close() call on the replica set by shutting down the haTimer and closing arbiter connections.

2.0.48 2015-11-07
-----------------
* GridFS no longer performs any deletes when writing a brand new file that does not have any previous <db>.fs.chunks or <db>.fs.files documents.
* Updated mongodb-core to 1.2.21.
* Hardened the checking for replicaset equality checks.
* OpReplay flag correctly set on Wire protocol query.
* Mongos load balancing added, introduced localThresholdMS to control the feature.
* Kerberos now a peerDependency, making it not install it by default in Node 5.0 or higher.

2.0.47 2015-10-28
-----------------
* Updated mongodb-core to 1.2.20.
* Fixed bug in arbiter connection capping code.
* NODE-599 correctly handle arrays of server tags in order of priority.
* Fix for 2.6 wire protocol handler related to readPreference handling.
* Added maxAwaitTimeMS support for 3.2 getMore to allow for custom timeouts on tailable cursors.
* Make CoreCursor check for $err before saying that 'next' succeeded (Issue #53, https://github.com/vkarpov15).

2.0.46 2015-10-15
-----------------
* Updated mongodb-core to 1.2.19.
* NODE-578 Order of sort fields is lost for numeric field names.
* Expose BSON Map (ES6 Map or polyfill).
* Minor fixes for APM support to pass extended APM test suite.

2.0.45 2015-09-30
-----------------
* NODE-566 Fix issue with rewind on capped collections causing cursor state to be reset on connection loss.

2.0.44 2015-09-28
-----------------
* Bug fixes for APM upconverting of legacy INSERT/UPDATE/REMOVE wire protocol messages.
* NODE-562, fixed issue where a Replicaset MongoDB URI with a single seed and replSet name set would cause a single direct connection instead of topology discovery.
* Updated mongodb-core to 1.2.14.
* NODE-563 Introduced options.ignoreUndefined for db class and MongoClient db options, made serialize undefined to null default again but allowing for overrides on insert/update/delete operations.
* Use handleCallback if result is an error for count queries. (Issue #1298, https://github.com/agclever)
* Rewind cursor to correctly force reconnect on capped collections when first query comes back empty.
* NODE-571 added code 59 to legacy server errors when SCRAM-SHA-1 mechanism fails.
* NODE-572 Remove examples that use the second parameter to `find()`.

2.0.43 2015-09-14
-----------------
* Propagate timeout event correctly to db instances.
* Application Monitoring API (APM) implemented.
* NOT providing replSet name in MongoClient connection URI will force single server connection. Fixes issue where it was impossible to directly connect to a replicaset member server.
* Updated mongodb-core to 1.2.12.
* NODE-541 Initial Support "read committed" isolation level where "committed" means confimed by the voting majority of a replica set.
* GridStore doesn't share readPreference setting from connection string. (Issue #1295, https://github.com/zhangyaoxing)
* fixed forceServerObjectId calls (Issue #1292, https://github.com/d-mon-)
* Pass promise library through to DB function (Issue #1294, https://github.com/RovingCodeMonkey)

2.0.42 2015-08-18
-----------------
* Added test case to exercise all non-crud methods on mongos topologies, fixed numberOfConnectedServers on mongos topology instance.

2.0.41 2015-08-14
-----------------
* Added missing Mongos.prototype.parserType function.
* Updated mongodb-core to 1.2.10.

2.0.40 2015-07-14
-----------------
* Updated mongodb-core to 1.2.9 for 2.4 wire protocol error handler fix.
* NODE-525 Reset connectionTimeout after it's overwritten by tls.connect.
* NODE-518 connectTimeoutMS is doubled in 2.0.39.
* NODE-506 Ensures that errors from bulk unordered and ordered are instanceof Error (Issue #1282, https://github.com/owenallenaz).
* NODE-526 Unique index not throwing duplicate key error.
* NODE-528 Ignore undefined fields in Collection.find().
* NODE-527 The API example for collection.createIndex shows Db.createIndex functionality.

2.0.39 2015-07-14
-----------------
* Updated mongodb-core to 1.2.6 for NODE-505.

2.0.38 2015-07-14
-----------------
* NODE-505 Query fails to find records that have a 'result' property with an array value.

2.0.37 2015-07-14
-----------------
* NODE-504 Collection * Default options when using promiseLibrary.
* NODE-500 Accidental repeat of hostname in seed list multiplies total connections persistently.
* Updated mongodb-core to 1.2.5 to fix NODE-492.

2.0.36 2015-07-07
-----------------
* Fully promisified allowing the use of ES6 generators and libraries like co. Also allows for BYOP (Bring your own promises).
* NODE-493 updated mongodb-core to 1.2.4 to ensure we cannot DDOS the mongod or mongos process on large connection pool sizes.

2.0.35 2015-06-17
-----------------
* Upgraded to mongodb-core 1.2.2 including removing warnings when C++ bson parser is not available and a fix for SCRAM authentication.

2.0.34 2015-06-17
-----------------
* Upgraded to mongodb-core 1.2.1 speeding up serialization and removing the need for the c++ bson extension.
* NODE-486 fixed issue related to limit and skip when calling toArray in 2.0 driver.
* NODE-483 throw error if capabilities of topology is queries before topology has performed connection setup.
* NODE-482 fixed issue where MongoClient.connect would incorrectly identify a replset seed list server as a non replicaset member.
* NODE-487 fixed issue where killcursor command was not being sent correctly on limit and skip queries.

2.0.33 2015-05-20
-----------------
* Bumped mongodb-core to 1.1.32.

2.0.32 2015-05-19
-----------------
* NODE-463 db.close immediately executes its callback.
* Don't only emit server close event once (Issue #1276, https://github.com/vkarpov15).
* NODE-464 Updated mongodb-core to 1.1.31 that uses a single socket connection to arbiters and hidden servers as well as emitting all event correctly.

2.0.31 2015-05-08
-----------------
* NODE-461 Tripping on error "no chunks found for file, possibly corrupt" when there is no error.

2.0.30 2015-05-07
-----------------
* NODE-460 fix; don't set authMechanism for user in db.authenticate() to avoid mongoose authentication issue.

2.0.29 2015-05-07
-----------------
* NODE-444 Possible memory leak, too many listeners added.
* NODE-459 Auth failure using Node 0.8.28, MongoDB 3.0.2 & mongodb-node-native 1.4.35.
* Bumped mongodb-core to 1.1.26.

2.0.28 2015-04-24
-----------------
* Bumped mongodb-core to 1.1.25
* Added Cursor.prototype.setCursorOption to allow for setting node specific cursor options for tailable cursors.
* NODE-430 Cursor.count() opts argument masked by var opts = {}
* NODE-406 Implemented Cursor.prototype.map function tapping into MongoClient cursor transforms.
* NODE-438 replaceOne is not returning the result.ops property as described in the docs.
* NODE-433 _read, pipe and write all open gridstore automatically if not open.
* NODE-426 ensure drain event is emitted after write function returns, fixes intermittent issues in writing files to gridstore.
* NODE-440 GridStoreStream._read() doesn't check GridStore.read() error.
* Always use readPreference = primary for findAndModify command (ignore passed in read preferences) (Issue #1274, https://github.com/vkarpov15).
* Minor fix in GridStore.exists for dealing with regular expressions searches.

2.0.27 2015-04-07
-----------------
* NODE-410 Correctly handle issue with pause/resume in Node 0.10.x that causes exceptions when using the Node 0.12.0 style streams.

2.0.26 2015-04-07
-----------------
* Implements the Common Index specification Standard API at https://github.com/mongodb/specifications/blob/master/source/index-management.rst.
* NODE-408 Expose GridStore.currentChunk.chunkNumber.

2.0.25 2015-03-26
-----------------
* Upgraded mongodb-core to 1.1.21, making the C++ bson code an optional dependency to the bson module.

2.0.24 2015-03-24
-----------------
* NODE-395 Socket Not Closing, db.close called before full set finished initalizing leading to server connections in progress not being closed properly.
* Upgraded mongodb-core to 1.1.20.

2.0.23 2015-03-21
-----------------
* NODE-380 Correctly return MongoError from toError method.
* Fixed issue where addCursorFlag was not correctly setting the flag on the command for mongodb-core.
* NODE-388 Changed length from method to property on order.js/unordered.js bulk operations.
* Upgraded mongodb-core to 1.1.19.

2.0.22 2015-03-16
-----------------
* NODE-377, fixed issue where tags would correctly be checked on secondary and nearest to filter out eligible server candidates.
* Upgraded mongodb-core to 1.1.17.

2.0.21 2015-03-06
-----------------
* Upgraded mongodb-core to 1.1.16 making sslValidate default to true to force validation on connection unless overriden by the user.

2.0.20 2015-03-04
-----------------
* Updated mongodb-core 1.1.15 to relax pickserver method.

2.0.19 2015-03-03
-----------------
* NODE-376 Fixes issue * Unordered batch incorrectly tracks batch size when switching batch types (Issue #1261, https://github.com/meirgottlieb)
* NODE-379 Fixes bug in cursor.count() that causes the result to always be zero for dotted collection names (Issue #1262, https://github.com/vsivsi)
* Expose MongoError from mongodb-core (Issue #1260, https://github.com/tjconcept)

2.0.18 2015-02-27
-----------------
* Bumped mongodb-core 1.1.14 to ensure passives are correctly added as secondaries.

2.0.17 2015-02-27
-----------------
* NODE-336 Added length function to ordered and unordered bulk operations to be able know the amount of current operations in bulk.
* Bumped mongodb-core 1.1.13 to ensure passives are correctly added as secondaries.

2.0.16 2015-02-16
-----------------
* listCollection now returns filtered result correctly removing db name for 2.6 or earlier servers.
* Bumped mongodb-core 1.1.12 to correctly work for node 0.12.0 and io.js.
* Add ability to get collection name from cursor (Issue #1253, https://github.com/vkarpov15)

2.0.15 2015-02-02
-----------------
* Unified behavior of listCollections results so 3.0 and pre 3.0 return same type of results.
* Bumped mongodb-core to 1.1.11 to support per document tranforms in cursors as well as relaxing the setName requirement.
* NODE-360 Aggregation cursor and command correctly passing down the maxTimeMS property.
* Added ~1.0 mongodb-tools module for test running.
* Remove the required setName for replicaset connections, if not set it will pick the first setName returned.

2.0.14 2015-01-21
-----------------
* Fixed some MongoClient.connect options pass through issues and added test coverage.
* Bumped mongodb-core to 1.1.9 including fixes for io.js

2.0.13 2015-01-09
-----------------
* Bumped mongodb-core to 1.1.8.
* Optimized query path for performance, moving Object.defineProperty outside of constructors.

2.0.12 2014-12-22
-----------------
* Minor fixes to listCollections to ensure correct querying of a collection when using a string.

2.0.11 2014-12-19
-----------------
* listCollections filters out index namespaces on < 2.8 correctly
* Bumped mongo-client to 1.1.7

2.0.10 2014-12-18
-----------------
* NODE-328 fixed db.open return when no callback available issue and added test.
* NODE-327 Refactored listCollections to return cursor to support 2.8.
* NODE-327 Added listIndexes method and refactored internal methods to use the new command helper.
* NODE-335 Cannot create index for nested objects fixed by relaxing key checking for createIndex helper.
* Enable setting of connectTimeoutMS (Issue #1235, https://github.com/vkarpov15)
* Bumped mongo-client to 1.1.6

2.0.9 2014-12-01
----------------
* Bumped mongodb-core to 1.1.3 fixing global leaked variables and introducing strict across all classes.
* All classes are now strict (Issue #1233)
* NODE-324 Refactored insert/update/remove and all other crud opts to rely on internal methods to avoid any recursion.
* Fixed recursion issues in debug logging due to JSON.stringify()
* Documentation fixes (Issue #1232, https://github.com/wsmoak)
* Fix writeConcern in Db.prototype.ensureIndex (Issue #1231, https://github.com/Qard)

2.0.8 2014-11-28
----------------
* NODE-322 Finished up prototype refactoring of Db class.
* NODE-322 Exposed Cursor in index.js for New Relic.

2.0.7 2014-11-20
----------------
* Bumped mongodb-core to 1.1.2 fixing a UTF8 encoding issue for collection names.
* NODE-318 collection.update error while setting a function with serializeFunctions option.
* Documentation fixes.

2.0.6 2014-11-14
----------------
* Refactored code to be prototype based instead of privileged methods.
* Bumped mongodb-core to 1.1.1 to take advantage of the prototype based refactorings.
* Implemented missing aspects of the CRUD specification.
* Fixed documentation issues.
* Fixed global leak REFERENCE_BY_ID in gridfs grid_store (Issue #1225, https://github.com/j)
* Fix LearnBoost/mongoose#2313: don't let user accidentally clobber geoNear params (Issue #1223, https://github.com/vkarpov15)

2.0.5 2014-10-29
----------------
* Minor fixes to documentation and generation of documentation.
* NODE-306 (No results in aggregation cursor when collection name contains a dot), Merged code for cursor and aggregation cursor.

2.0.4 2014-10-23
----------------
* Allow for single replicaset seed list with no setName specified (Issue #1220, https://github.com/imaman)
* Made each rewind on each call allowing for re-using the cursor.
* Fixed issue where incorrect iterations would happen on each for extensive batchSizes.
* NODE-301 specifying maxTimeMS on find causes all fields to be omitted from result.

2.0.3 2014-10-14
----------------
* NODE-297 Aggregate Broken for case of pipeline with no options.

2.0.2 2014-10-08
----------------
* Bumped mongodb-core to 1.0.2.
* Fixed bson module dependency issue by relying on the mongodb-core one.
* Use findOne instead of find followed by nextObject (Issue #1216, https://github.com/sergeyksv)

2.0.1 2014-10-07
----------------
* Dependency fix

2.0.0 2014-10-07
----------------
* First release of 2.0 driver

2.0.0-alpha2 2014-10-02
-----------------------
* CRUD API (insertOne, insertMany, updateOne, updateMany, removeOne, removeMany, bulkWrite, findOneAndDelete, findOneAndUpdate, findOneAndReplace)
* Cluster Management Spec compatible.

2.0.0-alpha1 2014-09-08
-----------------------
* Insert method allows only up 1000 pr batch for legacy as well as 2.6 mode
* Streaming behavior is 0.10.x or higher with backwards compatibility using readable-stream npm package
* Gridfs stream only available through .stream() method due to overlapping names on Gridstore object and streams in 0.10.x and higher of node
* remove third result on update and remove and return the whole result document instead (getting rid of the weird 3 result parameters)
    * Might break some application
* Returns the actual mongodb-core result instead of just the number of records changed for insert/update/remove
* MongoClient only has the connect method (no ability instantiate with Server, ReplSet or similar)
* Removed Grid class
* GridStore only supports w+ for metadata updates, no appending to file as it's not thread safe and can cause corruption of the data
    + seek will fail if attempt to use with w or w+
    + write will fail if attempted with w+ or r
    + w+ only works for updating metadata on a file
* Cursor toArray and each resets and re-runs the cursor
* FindAndModify returns whole result document instead of just value
* Extend cursor to allow for setting all the options via methods instead of dealing with the current messed up find
* Removed db.dereference method
* Removed db.cursorInfo method
* Removed db.stats method
* Removed db.collectionNames not needed anymore as it's just a specialized case of listCollections
* Removed db.collectionInfo removed due to not being compatible with new storage engines in 2.8 as they need to use the listCollections command due to system collections not working for namespaces.
* Added db.listCollections to replace several methods above

1.4.10 2014-09-04
-----------------
* Fixed BSON and Kerberos compilation issues
* Bumped BSON to ~0.2 always installing latest BSON 0.2.x series
* Fixed Kerberos and bumped to 0.0.4

1.4.9 2014-08-26
----------------
* Check _bsonType for Binary (Issue #1202, https://github.com/mchapman)
* Remove duplicate Cursor constructor (Issue #1201, https://github.com/KenPowers)
* Added missing parameter in the documentation (Issue #1199, https://github.com/wpjunior)
* Documented third parameter on the update callback(Issue #1196, https://github.com/gabmontes)
* NODE-240 Operations on SSL connection hang on node 0.11.x
* NODE-235 writeResult is not being passed on when error occurs in insert
* NODE-229 Allow count to work with query hints
* NODE-233 collection.save() does not support fullResult
* NODE-244 Should parseError also emit a `disconnected` event?
* NODE-246 Cursors are inefficiently constructed and consequently cannot be promisified.
* NODE-248 Crash with X509 auth
* NODE-252 Uncaught Exception in Base.__executeAllServerSpecificErrorCallbacks
* Bumped BSON parser to 0.2.12


1.4.8 2014-08-01
----------------
* NODE-205 correctly emit authenticate event
* NODE-210 ensure no undefined connection error when checking server state
* NODE-212 correctly inherit socketTimeoutMS from replicaset when HA process adds new servers or reconnects to existing ones
* NODE-220 don't throw error if ensureIndex errors out in Gridstore
* Updated bson to 0.2.11 to ensure correct toBSON behavior when returning non object in nested classes
* Fixed test running filters
* Wrap debug log in a call to format (Issue #1187, https://github.com/andyroyle)
* False option values should not trigger w:1 (Issue #1186, https://github.com/jsdevel)
* Fix aggregatestream.close(Issue #1194, https://github.com/jonathanong)
* Fixed parsing issue for w:0 in url parser when in connection string
* Modified collection.geoNear to support a geoJSON point or legacy coordinate pair (Issue #1198, https://github.com/mmacmillan)

1.4.7 2014-06-18
----------------
* Make callbacks to be executed in right domain when server comes back up (Issue #1184, https://github.com/anton-kotenko)
* Fix issue where currentOp query against mongos would fail due to mongos passing through $readPreference field to mongod (CS-X)

1.4.6 2014-06-12
----------------
* Added better support for MongoClient IP6 parsing (Issue #1181, https://github.com/micovery)
* Remove options check on index creation (Issue #1179, Issue #1183, https://github.com/jdesboeufs, https://github.com/rubenvereecken)
* Added missing type check before calling optional callback function (Issue #1180)

1.4.5 2014-05-21
----------------
* Added fullResult flag to insert/update/remove which will pass raw result document back. Document contents will vary depending on the server version the driver is talking to. No attempt is made to coerce a joint response.
* Fix to avoid MongoClient.connect hanging during auth when secondaries building indexes pre 2.6.
* return the destination stream in GridStore.pipe (Issue #1176, https://github.com/iamdoron)

1.4.4 2014-05-13
----------------
* Bumped BSON version to use the NaN 1.0 package, fixed strict comparison issue for ObjectID
* Removed leaking global variable (Issue #1174, https://github.com/dainis)
* MongoClient respects connectTimeoutMS for initial discovery process (NODE-185)
* Fix bug with return messages larger than 16MB but smaller than max BSON Message Size (NODE-184)

1.4.3 2014-05-01
----------------
* Clone options for commands to avoid polluting original options passed from Mongoose (Issue #1171, https://github.com/vkarpov15)
* Made geoNear and geoHaystackSearch only clean out allowed options from command generation (Issue #1167)
* Fixed typo for allowDiskUse (Issue #1168, https://github.com/joaofranca)
* A 'mapReduce' function changed 'function' to instance '\<Object\>' of 'Code' class (Issue #1165, https://github.com/exabugs)
* Made findAndModify set sort only when explicitly set (Issue #1163, https://github.com/sars)
* Rewriting a gridStore file by id should use a new filename if provided (Issue #1169, https://github.com/vsivsi)

1.4.2 2014-04-15
----------------
* Fix for inheritance of readPreferences from MongoClient NODE-168/NODE-169
* Merged in fix for ping strategy to avoid hitting non-pinged servers (Issue #1161, https://github.com/vaseker)
* Merged in fix for correct debug output for connection messages (Issue #1158, https://github.com/vaseker)
* Fixed global variable leak (Issue #1160, https://github.com/vaseker)

1.4.1 2014-04-09
----------------
* Correctly emit joined event when primary change
* Add _id to documents correctly when using bulk operations

1.4.0 2014-04-03
----------------
* All node exceptions will no longer be caught if on('error') is defined
* Added X509 auth support
* Fix for MongoClient connection timeout issue (NODE-97)
* Pass through error messages from parseError instead of just text (Issue #1125)
* Close db connection on error (Issue #1128, https://github.com/benighted)
* Fixed documentation generation
* Added aggregation cursor for 2.6 and emulated cursor for pre 2.6 (uses stream2)
* New Bulk API implementation using write commands for 2.6 and down converts for pre 2.6
* Insert/Update/Remove using new write commands when available
* Added support for new roles based API's in 2.6 for addUser/removeUser
* Added bufferMaxEntries to start failing if the buffer hits the specified number of entries
* Upgraded BSON parser to version 0.2.7 to work with < 0.11.10 C++ API changes
* Support for OP_LOG_REPLAY flag (NODE-94)
* Fixes for SSL HA ping and discovery.
* Uses createIndexes if available for ensureIndex/createIndex
* Added parallelCollectionScan method to collection returning CommandCursor instances for cursors
* Made CommandCursor behave as Readable stream.
* Only Db honors readPreference settings, removed Server.js legacy readPreference settings due to user confusion.
* Reconnect event emitted by ReplSet/Mongos/Server after reconnect and before replaying of buffered operations.
* GridFS buildMongoObject returns error on illegal md5 (NODE-157, https://github.com/iantocristian)
* Default GridFS chunk size changed to (255 * 1024) bytes to optimize for collections defaulting to power of 2 sizes on 2.6.
* Refactored commands to all go through command function ensuring consistent command execution.
* Fixed issues where readPreferences where not correctly passed to mongos.
* Catch error == null and make err detection more prominent (NODE-130)
* Allow reads from arbiter for single server connection (NODE-117)
* Handle error coming back with no documents (NODE-130)
* Correctly use close parameter in Gridstore.write() (NODE-125)
* Throw an error on a bulk find with no selector (NODE-129, https://github.com/vkarpov15)
* Use a shallow copy of options in find() (NODE-124, https://github.com/vkarpov15)
* Fix statistical strategy (NODE-158, https://github.com/vkarpov15)
* GridFS off-by-one bug in lastChunkNumber() causes uncaught throw and data loss (Issue #1154, https://github.com/vsivsi)
* GridStore drops passed `aliases` option, always results in `null` value in GridFS files (Issue #1152, https://github.com/vsivsi)
* Remove superfluous connect object copying in index.js (Issue #1145, https://github.com/thomseddon)
* Do not return false when the connection buffer is still empty (Issue #1143, https://github.com/eknkc)
* Check ReadPreference object on ReplSet.canRead (Issue #1142, https://github.com/eknkc)
* Fix unpack error on _executeQueryCommand (Issue #1141, https://github.com/eknkc)
* Close db on failed connect so node can exit (Issue #1128, https://github.com/benighted)
* Fix global leak with _write_concern (Issue #1126, https://github.com/shanejonas)

1.3.19 2013-08-21
-----------------
* Correctly rethrowing errors after change from event emission to callbacks, compatibility with 0.10.X domains without breaking 0.8.X support.
* Small fix to return the entire findAndModify result as the third parameter (Issue #1068)
* No removal of "close" event handlers on server reconnect, emits "reconnect" event when reconnection happens. Reconnect Only applies for single server connections as of now as semantics for ReplSet and Mongos is not clear (Issue #1056)

1.3.18 2013-08-10
-----------------
* Fixed issue when throwing exceptions in MongoClient.connect/Db.open (Issue #1057)
* Fixed an issue where _events is not cleaned up correctly causing a slow steady memory leak.

1.3.17 2013-08-07
-----------------
* Ignore return commands that have no registered callback
* Made collection.count not use the db.command function
* Fix throw exception on ping command (Issue #1055)

1.3.16 2013-08-02
-----------------
* Fixes connection issue where lots of connections would happen if a server is in recovery mode during connection (Issue #1050, NODE-50, NODE-51)
* Bug in unlink mulit filename (Issue #1054)

1.3.15 2013-08-01
-----------------
* Memory leak issue due to node Issue #4390 where _events[id] is set to undefined instead of deleted leading to leaks in the Event Emitter over time

1.3.14 2013-08-01
-----------------
* Fixed issue with checkKeys where it would error on X.X

1.3.13 2013-07-31
-----------------
* Added override for checkKeys on insert/update (Warning will expose you to injection attacks) (Issue #1046)
* BSON size checking now done pre serialization (Issue #1037)
* Added isConnected returns false when no connection Pool exists (Issue #1043)
* Unified command handling to ensure same handling (Issue #1041, #1042)
* Correctly emit "open" and "fullsetup" across all Db's associated with Mongos, ReplSet or Server (Issue #1040)
* Correctly handles bug in authentication when attempting to connect to a recovering node in a replicaset.
* Correctly remove recovering servers from available servers in replicaset. Piggybacks on the ping command.
* Removed findAndModify chaining to be compliant with behavior in other official drivers and to fix a known mongos issue.
* Fixed issue with Kerberos authentication on Windows for re-authentication.
* Fixed Mongos failover behavior to correctly throw out old servers.
* Ensure stored queries/write ops are executed correctly after connection timeout
* Added promoteLongs option for to allow for overriding the promotion of Longs to Numbers and return the actual Long.

1.3.12 2013-07-19
-----------------
* Fixed issue where timeouts sometimes would behave wrongly (Issue #1032)
* Fixed bug with callback third parameter on some commands (Issue #1033)
* Fixed possible issue where killcursor command might leave hanging functions
* Fixed issue where Mongos was not correctly removing dead servers from the pool of eligable servers
* Throw error if dbName or collection name contains null character (at command level and at collection level)
* Updated bson parser to 0.2.1 with security fix and non-promotion of Long values to javascript Numbers (once a long always a long)

1.3.11 2013-07-04
-----------------
* Fixed errors on geoNear and geoSearch (Issue #1024, https://github.com/ebensing)
* Add driver version to export (Issue #1021, https://github.com/aheckmann)
* Add text to readpreference obedient commands (Issue #1019)
* Drivers should check the query failure bit even on getmore response (Issue #1018)
* Map reduce has incorrect expectations of 'inline' value for 'out' option (Issue #1016, https://github.com/rcotter)
* Support SASL PLAIN authentication (Issue #1009)
* Ability to use different Service Name on the driver for Kerberos Authentication (Issue #1008)
* Remove unnecessary octal literal to allow the code to run in strict mode (Issue #1005, https://github.com/jamesallardice)
* Proper handling of recovering nodes (when they go into recovery and when they return from recovery, Issue #1027)

1.3.10 2013-06-17
-----------------
* Guard against possible undefined in server::canCheckoutWriter (Issue #992, https://github.com/willyaranda)
* Fixed some duplicate test names (Issue #993, https://github.com/kawanet)
* Introduced write and read concerns for GridFS (Issue #996)
* Fixed commands not correctly respecting Collection level read preference (Issue #995, #999)
* Fixed issue with pool size on replicaset connections (Issue #1000)
* Execute all query commands on master switch (Issue #1002, https://github.com/fogaztuc)

1.3.9 2013-06-05
----------------
* Fixed memory leak when findAndModify errors out on w>1 and chained callbacks not properly cleaned up.

1.3.8 2013-05-31
----------------
* Fixed issue with socket death on windows where it emits error event instead of close event (Issue #987)
* Emit authenticate event on db after authenticate method has finished on db instance (Issue #984)
* Allows creation of MongoClient and do new MongoClient().connect(..). Emits open event when connection correct allowing for apps to react on event.

1.3.7 2013-05-29
----------------
* After reconnect, tailable getMores go on inconsistent connections (Issue #981, #982, https://github.com/glasser)
* Updated Bson to 0.1.9 to fix ARM support (Issue #985)

1.3.6 2013-05-21
----------------
* Fixed issue where single server reconnect attempt would throw due to missing options variable (Issue #979)
* Fixed issue where difference in ismaster server name and seed list caused connections issues, (Issue #976)

1.3.5 2013-05-14
----------------
* Fixed issue where HA for replicaset would pick the same broken connection when attempting to ping the replicaset causing the replicaset to never recover.

1.3.4 2013-05-14
----------------
* Fixed bug where options not correctly passed in for uri parser (Issue #973, https://github.com/supershabam)
* Fixed bug when passing a named index hint (Issue #974)

1.3.3 2013-05-09
----------------
* Fixed auto-reconnect issue with single server instance.

1.3.2 2013-05-08
----------------
* Fixes for an issue where replicaset would be pronounced dead when high priority primary caused double elections.

1.3.1 2013-05-06
----------------
* Fix for replicaset consisting of primary/secondary/arbiter with priority applied failing to reconnect properly
* Applied auth before server instance is set as connected when single server connection
* Throw error if array of documents passed to save method

1.3.0 2013-04-25
----------------
* Whole High availability handling for Replicaset, Server and Mongos connections refactored to ensure better handling of failover cases.
* Fixed issue where findAndModify would not correctly skip issuing of chained getLastError (Issue #941)
* Fixed throw error issue on errors with findAndModify during write out operation (Issue #939, https://github.com/autopulated)
* Gridstore.prototype.writeFile now returns gridstore object correctly (Issue #938)
* Kerberos support is now an optional module that allows for use of GSSAPI authentication using MongoDB Subscriber edition
* Fixed issue where cursor.toArray could blow the stack on node 0.10.X (#950)

1.2.14 2013-03-14
-----------------
* Refactored test suite to speed up running of replicaset tests
* Fix of async error handling when error happens in callback (Issue #909, https://github.com/medikoo)
* Corrected a slaveOk setting issue (Issue #906, #905)
* Fixed HA issue where ping's would not go to correct server on HA server connection failure.
* Uses setImmediate if on 0.10 otherwise nextTick for cursor stream
* Fixed race condition in Cursor stream (NODE-31)
* Fixed issues related to node 0.10 and process.nextTick now correctly using setImmediate where needed on node 0.10
* Added support for maxMessageSizeBytes if available (DRIVERS-1)
* Added support for authSource (2.4) to MongoClient URL and db.authenticate method (DRIVER-69/NODE-34)
* Fixed issue in GridStore seek and GridStore read to correctly work on multiple seeks (Issue #895)

1.2.13 2013-02-22
-----------------
* Allow strategy 'none' for repliaset if no strategy wanted (will default to round robin selection of servers on a set readPreference)
* Fixed missing MongoErrors on some cursor methods (Issue #882)
* Correctly returning a null for the db instance on MongoClient.connect when auth fails (Issue #890)
* Added dropTarget option support for renameCollection/rename (Issue #891, help from https://github.com/jbottigliero)
* Fixed issue where connection using MongoClient.connect would fail if first server did not exist (Issue #885)

1.2.12 2013-02-13
-----------------
* Added limit/skip options to Collection.count (Issue #870)
* Added applySkipLimit option to Cursor.count (Issue #870)
* Enabled ping strategy as default for Replicaset if none specified (Issue #876)
* Should correctly pick nearest server for SECONDARY/SECONDARY_PREFERRED/NEAREST (Issue #878)

1.2.11 2013-01-29
-----------------
* Added fixes for handling type 2 binary due to PHP driver (Issue #864)
* Moved callBackStore to Base class to have single unified store (Issue #866)
* Ping strategy now reuses sockets unless they are closed by the server to avoid overhead

1.2.10 2013-01-25
-----------------
* Merged in SSL support for 2.4 supporting certificate validation and presenting certificates to the server.
* Only open a new HA socket when previous one dead (Issue #859, #857)
* Minor fixes

1.2.9 2013-01-15
----------------
* Fixed bug in SSL support for MongoClient/Db.connect when discovering servers (Issue #849)
* Connection string with no db specified should default to admin db (Issue #848)
* Support port passed as string to Server class (Issue #844)
* Removed noOpen support for MongoClient/Db.connect as auto discovery of servers for Mongod/Mongos makes it not possible (Issue #842)
* Included toError wrapper code moved to utils.js file (Issue #839, #840)
* Rewrote cursor handling to avoid process.nextTick using trampoline instead to avoid stack overflow, speedup about 40%

1.2.8 2013-01-07
----------------
* Accept function in a Map Reduce scope object not only a function string (Issue #826, https://github.com/aheckmann)
* Typo in db.authenticate caused a check (for provided connection) to return false, causing a connection AND onAll=true to be passed into __executeQueryCommand downstream (Issue #831, https://github.com/m4tty)
* Allow gridfs objects to use non ObjectID ids (Issue #825, https://github.com/nailgun)
* Removed the double wrap, by not passing an Error object to the wrap function (Issue #832, https://github.com/m4tty)
* Fix connection leak (gh-827) for HA replicaset health checks (Issue #833, https://github.com/aheckmann)
* Modified findOne to use nextObject instead of toArray avoiding a nextTick operation (Issue #836)
* Fixes for cursor stream to avoid multiple getmore issues when one in progress (Issue #818)
* Fixes .open replaying all backed up commands correctly if called after operations performed, (Issue #829 and #823)

1.2.7 2012-12-23
----------------
* Rolled back batches as they hang in certain situations
* Fixes for NODE-25, keep reading from secondaries when primary goes down

1.2.6 2012-12-21
----------------
* domain sockets shouldn't require a port arg (Issue #815, https://github.com/aheckmann)
* Cannot read property 'info' of null (Issue #809, https://github.com/thesmart)
* Cursor.each should work in batches (Issue #804, https://github.com/Swatinem)
* Cursor readPreference bug for non-supported read preferences (Issue #817)

1.2.5 2012-12-12
----------------
* Fixed ssl regression, added more test coverage (Issue #800)
* Added better error reporting to the Db.connect if no valid serverConfig setup found (Issue #798)

1.2.4 2012-12-11
----------------
* Fix to ensure authentication is correctly applied across all secondaries when using MongoClient.

1.2.3 2012-12-10
----------------
* Fix for new replicaset members correctly authenticating when being added (Issue #791, https://github.com/m4tty)
* Fixed seek issue in gridstore when using stream (Issue #790)

1.2.2 2012-12-03
----------------
* Fix for journal write concern not correctly being passed under some circumstances.
* Fixed correct behavior and re-auth for servers that get stepped down (Issue #779).

1.2.1 2012-11-30
----------------
* Fix for double callback on insert with w:0 specified (Issue #783)
* Small cleanup of urlparser.

1.2.0 2012-11-27
----------------
* Honor connectTimeoutMS option for replicasets (Issue #750, https://github.com/aheckmann)
* Fix ping strategy regression (Issue #738, https://github.com/aheckmann)
* Small cleanup of code (Issue #753, https://github.com/sokra/node-mongodb-native)
* Fixed index declaration using objects/arrays from other contexts (Issue #755, https://github.com/sokra/node-mongodb-native)
* Intermittent (and rare) null callback exception when using ReplicaSets (Issue #752)
* Force correct setting of read_secondary based on the read preference (Issue #741)
* If using read preferences with secondaries queries will not fail if primary is down (Issue #744)
* noOpen connection for Db.connect removed as not compatible with autodetection of Mongo type
* Mongos connection with auth not working (Issue #737)
* Use the connect method directly from the require. require('mongodb')("mongodb://localhost:27017/db")
* new MongoClient introduced as the point of connecting to MongoDB's instead of the Db
  * open/close/db/connect methods implemented
* Implemented common URL connection format using MongoClient.connect allowing for simialar interface across all drivers.
* Fixed a bug with aggregation helper not properly accepting readPreference

1.1.11 2012-10-10
-----------------
* Removed strict mode and introduced normal handling of safe at DB level.

1.1.10 2012-10-08
-----------------
* fix Admin.serverStatus (Issue #723, https://github.com/Contra)
* logging on connection open/close(Issue #721, https://github.com/asiletto)
* more fixes for windows bson install (Issue #724)

1.1.9 2012-10-05
----------------
* Updated bson to 0.1.5 to fix build problem on sunos/windows.

1.1.8 2012-10-01
----------------
* Fixed db.eval to correctly handle system.js global javascript functions (Issue #709)
* Cleanup of non-closing connections (Issue #706)
* More cleanup of connections under replicaset (Issue #707, https://github.com/elbert3)
* Set keepalive on as default, override if not needed
* Cleanup of jsbon install to correctly build without install.js script (https://github.com/shtylman)
* Added domain socket support new Server("/tmp/mongodb.sock") style

1.1.7 2012-09-10
----------------
* Protect against starting PingStrategy being called more than once (Issue #694, https://github.com/aheckmann)
* Make PingStrategy interval configurable (was 1 second, relaxed to 5) (Issue #693, https://github.com/aheckmann)
* Made PingStrategy api more consistant, callback to start/stop methods are optional (Issue #693, https://github.com/aheckmann)
* Proper stopping of strategy on replicaset stop
* Throw error when gridstore file is not found in read mode (Issue #702, https://github.com/jbrumwell)
* Cursor stream resume now using nextTick to avoid duplicated records (Issue #696)

1.1.6 2012-09-01
----------------
* Fix for readPreference NEAREST for replicasets (Issue #693, https://github.com/aheckmann)
* Emit end correctly on stream cursor (Issue #692, https://github.com/Raynos)

1.1.5 2012-08-29
----------------
* Fix for eval on replicaset Issue #684
* Use helpful error msg when native parser not compiled (Issue #685, https://github.com/aheckmann)
* Arbiter connect hotfix (Issue #681, https://github.com/fengmk2)
* Upgraded bson parser to 0.1.2 using gyp, deprecated support for node 0.4.X
* Added name parameter to createIndex/ensureIndex to be able to override index names larger than 128 bytes
* Added exhaust option for find for feature completion (not recommended for normal use)
* Added tailableRetryInterval to find for tailable cursors to allow to control getMore retry time interval
* Fixes for read preferences when using MongoS to correctly handle no read preference set when iterating over a cursor (Issue #686)

1.1.4 2012-08-12
----------------
* Added Mongos connection type with a fallback list for mongos proxies, supports ha (on by default) and will attempt to reconnect to failed proxies.
* Documents can now have a toBSON method that lets the user control the serialization behavior for documents being saved.
* Gridstore instance object now works as a readstream or writestream (thanks to code from Aaron heckmann (https://github.com/aheckmann/gridfs-stream)).
* Fix gridfs readstream (Issue #607, https://github.com/tedeh).
* Added disableDriverBSONSizeCheck property to Server.js for people who wish to push the inserts to the limit (Issue #609).
* Fixed bug where collection.group keyf given as Code is processed as a regular object (Issue #608, https://github.com/rrusso2007).
* Case mismatch between driver's ObjectID and mongo's ObjectId, allow both (Issue #618).
* Cleanup map reduce (Issue #614, https://github.com/aheckmann).
* Add proper error handling to gridfs (Issue #615, https://github.com/aheckmann).
* Ensure cursor is using same connection for all operations to avoid potential jump of servers when using replicasets.
* Date identification handled correctly in bson js parser when running in vm context.
* Documentation updates
* GridStore filename not set on read (Issue #621)
* Optimizations on the C++ bson parser to fix a potential memory leak and avoid non-needed calls
* Added support for awaitdata for tailable cursors (Issue #624)
* Implementing read preference setting at collection and cursor level
   * collection.find().setReadPreference(Server.SECONDARY_PREFERRED)
   * db.collection("some", {readPreference:Server.SECONDARY})
* Replicaset now returns when the master is discovered on db.open and lets the rest of the connections happen asynchronous.
  * ReplSet/ReplSetServers emits "fullsetup" when all servers have been connected to
* Prevent callback from executing more than once in getMore function (Issue #631, https://github.com/shankar0306)
* Corrupt bson messages now errors out to all callbacks and closes up connections correctly, Issue #634
* Replica set member status update when primary changes bug (Issue #635, https://github.com/alinsilvian)
* Fixed auth to work better when multiple connections are involved.
* Default connection pool size increased to 5 connections.
* Fixes for the ReadStream class to work properly with 0.8 of Node.js
* Added explain function support to aggregation helper
* Added socketTimeoutMS and connectTimeoutMS to socket options for repl_set.js and server.js
* Fixed addUser to correctly handle changes in 2.2 for getLastError authentication required
* Added index to gridstore chunks on file_id (Issue #649, https://github.com/jacobbubu)
* Fixed Always emit db events (Issue #657)
* Close event not correctly resets DB openCalled variable to allow reconnect
* Added open event on connection established for replicaset, mongos and server
* Much faster BSON C++ parser thanks to Lucasfilm Singapore.
* Refactoring of replicaset connection logic to simplify the code.
* Add `options.connectArbiter` to decide connect arbiters or not (Issue #675)
* Minor optimization for findAndModify when not using j,w or fsync for safe

1.0.2 2012-05-15
----------------
* Reconnect functionality for replicaset fix for mongodb 2.0.5

1.0.1 2012-05-12
----------------
* Passing back getLastError object as 3rd parameter on findAndModify command.
* Fixed a bunch of performance regressions in objectId and cursor.
* Fixed issue #600 allowing for single document delete to be passed in remove command.

1.0.0 2012-04-25
----------------
* Fixes to handling of failover on server error
* Only emits error messages if there are error listeners to avoid uncaught events
* Server.isConnected using the server state variable not the connection pool state

0.9.9.8 2012-04-12
------------------
* _id=0 is being turned into an ObjectID (Issue #551)
* fix for error in GridStore write method (Issue #559)
* Fix for reading a GridStore from arbitrary, non-chunk aligned offsets, added test (Issue #563, https://github.com/subroutine)
* Modified limitRequest to allow negative limits to pass through to Mongo, added test (Issue #561)
* Corrupt GridFS files when chunkSize < fileSize, fixed concurrency issue (Issue #555)
* Handle dead tailable cursors (Issue #568, https://github.com/aheckmann)
* Connection pools handles closing themselves down and clearing the state
* Check bson size of documents against maxBsonSize and throw client error instead of server error, (Issue #553)
* Returning update status document at the end of the callback for updates, (Issue #569)
* Refactor use of Arguments object to gain performance (Issue #574, https://github.com/AaronAsAChimp)

0.9.9.7 2012-03-16
------------------
* Stats not returned from map reduce with inline results (Issue #542)
* Re-enable testing of whether or not the callback is called in the multi-chunk seek, fix small GridStore bug (Issue #543, https://github.com/pgebheim)
* Streaming large files from GridFS causes truncation (Issue #540)
* Make callback type checks agnostic to V8 context boundaries (Issue #545)
* Correctly throw error if an attempt is made to execute an insert/update/remove/createIndex/ensureIndex with safe enabled and no callback
* Db.open throws if the application attemps to call open again without calling close first

0.9.9.6 2012-03-12
------------------
* BSON parser is externalized in it's own repository, currently using git master
* Fixes for Replicaset connectivity issue (Issue #537)
* Fixed issues with node 0.4.X vs 0.6.X (Issue #534)
* Removed SimpleEmitter and replaced with standard EventEmitter
* GridStore.seek fails to change chunks and call callback when in read mode (Issue #532)

0.9.9.5 2012-03-07
------------------
* Merged in replSetGetStatus helper to admin class (Issue #515, https://github.com/mojodna)
* Merged in serverStatus helper to admin class (Issue #516, https://github.com/mojodna)
* Fixed memory leak in C++ bson parser (Issue #526)
* Fix empty MongoError "message" property (Issue #530, https://github.com/aheckmann)
* Cannot save files with the same file name to GridFS (Issue #531)

0.9.9.4 2012-02-26
------------------
* bugfix for findAndModify: Error: corrupt bson message < 5 bytes long (Issue #519)

0.9.9.3 2012-02-23
------------------
* document: save callback arguments are both undefined, (Issue #518)
* Native BSON parser install error with npm, (Issue #517)

0.9.9.2 2012-02-17
------------------
* Improved detection of Buffers using Buffer.isBuffer instead of instanceof.
* Added wrap error around db.dropDatabase to catch all errors (Issue #512)
* Added aggregate helper to collection, only for MongoDB >= 2.1

0.9.9.1 2012-02-15
------------------
* Better handling of safe when using some commands such as createIndex, ensureIndex, addUser, removeUser, createCollection.
* Mapreduce now throws error if out parameter is not specified.

0.9.9 2012-02-13
----------------
* Added createFromTime method on ObjectID to allow for queries against _id more easily using the timestamp.
* Db.close(true) now makes connection unusable as it's been force closed by app.
* Fixed mapReduce and group functions to correctly send slaveOk on queries.
* Fixes for find method to correctly work with find(query, fields, callback) (Issue #506).
* A fix for connection error handling when using the SSL on MongoDB.

0.9.8-7 2012-02-06
------------------
* Simplified findOne to use the find command instead of the custom code (Issue #498).
* BSON JS parser not also checks for _bsonType variable in case BSON object is in weird scope (Issue #495).

0.9.8-6 2012-02-04
------------------
* Removed the check for replicaset change code as it will never work with node.js.

0.9.8-5 2012-02-02
------------------
* Added geoNear command to Collection.
* Added geoHaystackSearch command to Collection.
* Added indexes command to collection to retrieve the indexes on a Collection.
* Added stats command to collection to retrieve the statistics on a Collection.
* Added listDatabases command to admin object to allow retrieval of all available dbs.
* Changed createCreateIndexCommand to work better with options.
* Fixed dereference method on Db class to correctly dereference Db reference objects.
* Moved connect object onto Db class(Db.connect) as well as keeping backward compatibility.
* Removed writeBuffer method from gridstore, write handles switching automatically now.
* Changed readBuffer to read on Gridstore, Gridstore now only supports Binary Buffers no Strings anymore.
* Moved Long class to bson directory.

0.9.8-4 2012-01-28
------------------
* Added reIndex command to collection and db level.
* Added support for $returnKey, $maxScan, $min, $max, $showDiskLoc, $comment to cursor and find/findOne methods.
* Added dropDups and v option to createIndex and ensureIndex.
* Added isCapped method to Collection.
* Added indexExists method to Collection.
* Added findAndRemove method to Collection.
* Fixed bug for replicaset connection when no active servers in the set.
* Fixed bug for replicaset connections when errors occur during connection.
* Merged in patch for BSON Number handling from Lee Salzman, did some small fixes and added test coverage.

0.9.8-3 2012-01-21
------------------
* Workaround for issue with Object.defineProperty (Issue #484)
* ObjectID generation with date does not set rest of fields to zero (Issue #482)

0.9.8-2 2012-01-20
------------------
* Fixed a missing this in the ReplSetServers constructor.

0.9.8-1 2012-01-17
------------------
* FindAndModify bug fix for duplicate errors (Issue #481)

0.9.8 2012-01-17
----------------
* Replicasets now correctly adjusts to live changes in the replicaset configuration on the servers, reconnecting correctly.
  * Set the interval for checking for changes setting the replicaSetCheckInterval property when creating the ReplSetServers instance or on db.serverConfig.replicaSetCheckInterval. (default 1000 miliseconds)
* Fixes formattedOrderClause in collection.js to accept a plain hash as a parameter (Issue #469) https://github.com/tedeh
* Removed duplicate code for formattedOrderClause and moved to utils module
* Pass in poolSize for ReplSetServers to set default poolSize for new replicaset members
* Bug fix for BSON JS deserializer. Isolating the eval functions in separate functions to avoid V8 deoptimizations
* Correct handling of illegal BSON messages during deserialization
* Fixed Infinite loop when reading GridFs file with no chunks (Issue #471)
* Correctly update existing user password when using addUser (Issue #470)

0.9.7.3-5 2012-01-04
--------------------
* Fix for RegExp serialization for 0.4.X where typeof /regexp/ == 'function' vs in 0.6.X typeof /regexp/ == 'object'
* Don't allow keepAlive and setNoDelay for 0.4.X as it throws errors

0.9.7.3-4 2012-01-04
--------------------
* Chased down potential memory leak on findAndModify, Issue #467 (node.js removeAllListeners leaves the key in the _events object, node.js bug on eventlistener?, leads to extremely slow memory leak on listener object)
* Sanity checks for GridFS performance with benchmark added

0.9.7.3-3 2012-01-04
--------------------
* Bug fixes for performance issues going form 0.9.6.X to 0.9.7.X on linux
* BSON bug fixes for performance

0.9.7.3-2 2012-01-02
--------------------
* Fixed up documentation to reflect the preferred way of instantiating bson types
* GC bug fix for JS bson parser to avoid stop-and-go GC collection

0.9.7.3-1 2012-01-02
--------------------
* Fix to make db.bson_serializer and db.bson_deserializer work as it did previously

0.9.7.3 2011-12-30
--------------------
* Moved BSON_BINARY_SUBTYPE_DEFAULT from BSON object to Binary object and removed the BSON_BINARY_ prefixes
* Removed Native BSON types, C++ parser uses JS types (faster due to cost of crossing the JS-C++ barrier for each call)
* Added build fix for 0.4.X branch of Node.js where GetOwnPropertyNames is not defined in v8
* Fix for wire protocol parser for corner situation where the message is larger than the maximum socket buffer in node.js (Issue #464, #461, #447)
* Connection pool status set to connected on poolReady, isConnected returns false on anything but connected status (Issue #455)

0.9.7.2-5 2011-12-22
--------------------
* Brand spanking new Streaming Cursor support Issue #458 (https://github.com/christkv/node-mongodb-native/pull/458) thanks to Mr Aaron Heckmann

0.9.7.2-4 2011-12-21
--------------------
* Refactoring of callback code to work around performance regression on linux
* Fixed group function to correctly use the command mode as default

0.9.7.2-3 2011-12-18
--------------------
* Fixed error handling for findAndModify while still working for mongodb 1.8.6 (Issue #450).
* Allow for force send query to primary, pass option (read:'primary') on find command.
    * ``find({a:1}, {read:'primary'}).toArray(function(err, items) {});``

0.9.7.2-2 2011-12-16
--------------------
* Fixes infinite streamRecords QueryFailure fix when using Mongos (Issue #442)

0.9.7.2-1 2011-12-16
--------------------
* ~10% perf improvement for ObjectId#toHexString (Issue #448, https://github.com/aheckmann)
* Only using process.nextTick on errors emitted on callbacks not on all parsing, reduces number of ticks in the driver
* Changed parsing off bson messages to use process.nextTick to do bson parsing in batches if the message is over 10K as to yield more time to the event look increasing concurrency on big mongoreply messages with multiple documents

0.9.7.2 2011-12-15
------------------
* Added SSL support for future version of mongodb (VERY VERY EXPERIMENTAL)
    * pass in the ssl:true option to the server or replicaset server config to enable
    * a bug either in mongodb or node.js does not allow for more than 1 connection pr db instance (poolSize:1).
* Added getTimestamp() method to objectID that returns a date object
* Added finalize function to collection.group
    * function group (keys, condition, initial, reduce, finalize, command, callback)
* Reaper no longer using setTimeout to handle reaping. Triggering is done in the general flow leading to predictable behavior.
    * reaperInterval, set interval for reaper (default 10000 miliseconds)
    * reaperTimeout, set timeout for calls (default 30000 miliseconds)
    * reaper, enable/disable reaper (default false)
* Work around for issues with findAndModify during high concurrency load, insure that the behavior is the same across the 1.8.X branch and 2.X branch of MongoDb
* Reworked multiple db's sharing same connection pool to behave correctly on error, timeout and close
* EnsureIndex command can be executed without a callback (Issue #438)
* Eval function no accepts options including nolock (Issue #432)
    * eval(code, parameters, options, callback) (where options = {nolock:true})

0.9.7.1-4 2011-11-27
--------------------
* Replaced install.sh with install.js to install correctly on all supported os's

0.9.7.1-3 2011-11-27
--------------------
* Fixes incorrect scope for ensureIndex error wrapping (Issue #419) https://github.com/ritch

0.9.7.1-2 2011-11-27
--------------------
* Set statistical selection strategy as default for secondary choice.

0.9.7.1-1 2011-11-27
--------------------
* Better handling of single server reconnect (fixes some bugs)
* Better test coverage of single server failure
* Correct handling of callbacks on replicaset servers when firewall dropping packets, correct reconnect

0.9.7.1 2011-11-24
------------------
* Better handling of dead server for single server instances
* FindOne and find treats selector == null as {}, Issue #403
* Possible to pass in a strategy for the replicaset to pick secondary reader node
    * parameter strategy
        * ping (default), pings the servers and picks the one with the lowest ping time
        * statistical, measures each request and pick the one with the lowest mean and std deviation
* Set replicaset read preference replicaset.setReadPreference()
    * Server.READ_PRIMARY (use primary server for reads)
    * Server.READ_SECONDARY (from a secondary server (uses the strategy set))
    * tags, {object of tags}
* Added replay of commands issued to a closed connection when the connection is re-established
* Fix isConnected and close on unopened connections. Issue #409, fix by (https://github.com/sethml)
* Moved reaper to db.open instead of constructor (Issue #406)
* Allows passing through of socket connection settings to Server or ReplSetServer under the option socketOptions
    * timeout = set seconds before connection times out (default 0)
    * noDelay = Disables the Nagle algorithm (default true)
    * keepAlive = Set if keepAlive is used (default 0, which means no keepAlive, set higher than 0 for keepAlive)
    * encoding = ['ascii', 'utf8', or 'base64'] (default null)
* Fixes for handling of errors during shutdown off a socket connection
* Correctly applies socket options including timeout
* Cleanup of test management code to close connections correctly
* Handle parser errors better, closing down the connection and emitting an error
* Correctly emit errors from server.js only wrapping errors that are strings

0.9.7 2011-11-10
----------------
* Added priority setting to replicaset manager
* Added correct handling of passive servers in replicaset
* Reworked socket code for simpler clearer handling
* Correct handling of connections in test helpers
* Added control of retries on failure
    * control with parameters retryMiliSeconds and numberOfRetries when creating a db instance
* Added reaper that will timeout and cleanup queries that never return
    * control with parameters reaperInterval and reaperTimeout when creating a db instance
* Refactored test helper classes for replicaset tests
* Allows raw (no bson parser mode for insert, update, remove, find and findOne)
    * control raw mode passing in option raw:true on the commands
    * will return buffers with the binary bson objects
* Fixed memory leak in cursor.toArray
* Fixed bug in command creation for mongodb server with wrong scope of call
* Added db(dbName) method to db.js to allow for reuse of connections against other databases
* Serialization of functions in an object is off by default, override with parameter
    * serializeFunctions [true/false] on db level, collection level or individual insert/update/findAndModify
* Added Long.fromString to c++ class and fixed minor bug in the code (Test case for $gt operator on 64-bit integers, Issue #394)
* FindOne and find now share same code execution and will work in the same manner, Issue #399
* Fix for tailable cursors, Issue #384
* Fix for Cursor rewind broken, Issue #389
* Allow Gridstore.exist to query using regexp, Issue #387, fix by (https://github.com/kaij)
* Updated documentation on https://github.com/christkv/node-mongodb-native
* Fixed toJSON methods across all objects for BSON, Binary return Base64 Encoded data

0.9.6-22 2011-10-15
-------------------
* Fixed bug in js bson parser that could cause wrong object size on serialization, Issue #370
* Fixed bug in findAndModify that did not throw error on replicaset timeout, Issue #373

0.9.6-21 2011-10-05
-------------------
* Reworked reconnect code to work correctly
* Handling errors in different parts of the code to ensure that it does not lock the connection
* Consistent error handling for Object.createFromHexString for JS and C++

0.9.6-20 2011-10-04
-------------------
* Reworked bson.js parser to get rid off Array.shift() due to it allocating new memory for each call. Speedup varies between 5-15% depending on doc
* Reworked bson.cc to throw error when trying to serialize js bson types
* Added MinKey, MaxKey and Double support for JS and C++ parser
* Reworked socket handling code to emit errors on unparsable messages
* Added logger option for Db class, lets you pass in a function in the shape
    {
        log : function(message, object) {},
        error : function(errorMessage, errorObject) {},
        debug : function(debugMessage, object) {},
    }

  Usage is new Db(new Server(..), {logger: loggerInstance})

0.9.6-19 2011-09-29
-------------------
* Fixing compatibility issues between C++ bson parser and js parser
* Added Symbol support to C++ parser
* Fixed socket handling bug for seldom misaligned message from mongodb
* Correctly handles serialization of functions using the C++ bson parser

0.9.6-18 2011-09-22
-------------------
* Fixed bug in waitForConnection that would lead to 100% cpu usage, Issue #352

0.9.6-17 2011-09-21
-------------------
* Fixed broken exception test causing bamboo to hang
* Handling correctly command+lastError when both return results as in findAndModify, Issue #351

0.9.6-16 2011-09-14
-------------------
* Fixing a bunch of issues with compatibility with MongoDB 2.0.X branch. Some fairly big changes in behavior from 1.8.X to 2.0.X on the server.
* Error Connection MongoDB V2.0.0 with Auth=true, Issue #348

0.9.6-15 2011-09-09
-------------------
* Fixed issue where pools would not be correctly cleaned up after an error, Issue #345
* Fixed authentication issue with secondary servers in Replicaset, Issue #334
* Duplicate replica-set servers when omitting port, Issue #341
* Fixing findAndModify to correctly work with Replicasets ensuring proper error handling, Issue #336
* Merged in code from (https://github.com/aheckmann) that checks for global variable leaks

0.9.6-14 2011-09-05
-------------------
* Minor fixes for error handling in cursor streaming (https://github.com/sethml), Issue #332
* Minor doc fixes
* Some more cursor sort tests added, Issue #333
* Fixes to work with 0.5.X branch
* Fix Db not removing reconnect listener from serverConfig, (https://github.com/sbrekken), Issue #337
* Removed node_events.h includes (https://github.com/jannehietamaki), Issue #339
* Implement correct safe/strict mode for findAndModify.

0.9.6-13 2011-08-24
-------------------
* Db names correctly error checked for illegal characters

0.9.6-12 2011-08-24
-------------------
* Nasty bug in GridFS if you changed the default chunk size
* Fixed error handling bug in findOne

0.9.6-11 2011-08-23
-------------------
* Timeout option not correctly making it to the cursor, Issue #320, Fix from (https://github.com/year2013)
* Fixes for memory leaks when using buffers and C++ parser
* Fixes to make tests pass on 0.5.X
* Cleanup of bson.js to remove duplicated code paths
* Fix for errors occurring in ensureIndex, Issue #326
* Removing require.paths to make tests work with the 0.5.X branch

0.9.6-10 2011-08-11
-------------------
* Specific type Double for capped collections (https://github.com/mbostock), Issue #312
* Decorating Errors with all all object info from Mongo (https://github.com/laurie71), Issue #308
* Implementing fixes for mongodb 1.9.1 and higher to make tests pass
* Admin validateCollection now takes an options argument for you to pass in full option
* Implemented keepGoing parameter for mongodb 1.9.1 or higher, Issue #310
* Added test for read_secondary count issue, merged in fix from (https://github.com/year2013), Issue #317

0.9.6-9
-------
* Bug fix for bson parsing the key '':'' correctly without crashing

0.9.6-8
-------
* Changed to using node.js crypto library MD5 digest
* Connect method support documented mongodb: syntax by (https://github.com/sethml)
* Support Symbol type for BSON, serializes to it's own type Symbol, Issue #302, #288
* Code object without scope serializing to correct BSON type
* Lot's of fixes to avoid double callbacks (https://github.com/aheckmann) Issue #304
* Long deserializes as Number for values in the range -2^53 to 2^53, Issue #305 (https://github.com/sethml)
* Fixed C++ parser to reflect JS parser handling of long deserialization
* Bson small optimizations

0.9.6-7 2011-07-13
------------------
* JS Bson deserialization bug #287

0.9.6-6 2011-07-12
------------------
* FindAndModify not returning error message as other methods Issue #277
* Added test coverage for $push, $pushAll and $inc atomic operations
* Correct Error handling for non 12/24 bit ids on Pure JS ObjectID class Issue #276
* Fixed terrible deserialization bug in js bson code #285
* Fix by andrewjstone to avoid throwing errors when this.primary not defined

0.9.6-5 2011-07-06
------------------
* Rewritten BSON js parser now faster than the C parser on my core2duo laptop
* Added option full to indexInformation to get all index info Issue #265
* Passing in ObjectID for new Gridstore works correctly Issue #272

0.9.6-4 2011-07-01
------------------
* Added test and bug fix for insert/update/remove without callback supplied

0.9.6-3 2011-07-01
------------------
* Added simple grid class called Grid with put, get, delete methods
* Fixed writeBuffer/readBuffer methods on GridStore so they work correctly
* Automatic handling of buffers when using write method on GridStore
* GridStore now accepts a ObjectID instead of file name for write and read methods
* GridStore.list accepts id option to return of file ids instead of filenames
* GridStore close method returns document for the file allowing user to reference _id field

0.9.6-2 2011-06-30
------------------
* Fixes for reconnect logic for server object (replays auth correctly)
* More testcases for auth
* Fixes in error handling for replicaset
* Fixed bug with safe parameter that would fail to execute safe when passing w or wtimeout
* Fixed slaveOk bug for findOne method
* Implemented auth support for replicaset and test cases
* Fixed error when not passing in rs_name

0.9.6-1 2011-06-25
------------------
* Fixes for test to run properly using c++ bson parser
* Fixes for dbref in native parser (correctly handles ref without db component)
* Connection fixes for replicasets to avoid runtime conditions in cygwin (https://github.com/vincentcr)
* Fixes for timestamp in js bson parser (distinct timestamp type now)

0.9.6 2011-06-21
----------------
* Worked around npm version handling bug
* Race condition fix for cygwin (https://github.com/vincentcr)

0.9.5-1 2011-06-21
------------------
* Extracted Timestamp as separate class for bson js parser to avoid instanceof problems
* Fixed driver strict mode issue

0.9.5 2011-06-20
----------------
* Replicaset support (failover and reading from secondary servers)
* Removed ServerPair and ServerCluster
* Added connection pool functionality
* Fixed serious bug in C++ bson parser where bytes > 127 would generate 2 byte sequences
* Allows for forcing the server to assign ObjectID's using the option {forceServerObjectId: true}

0.6.8
-----
* Removed multiple message concept from bson
* Changed db.open(db) to be db.open(err, db)

0.1 2010-01-30
--------------
* Initial release support of driver using native node.js interface
* Supports gridfs specification
* Supports admin functionality
