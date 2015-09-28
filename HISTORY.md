1.2.14 09-28-2015
-----------------
- NODE-547 only emit error if there are any listeners.
- Fixed APM issue with issuing readConcern.

1.2.13 09-18-2015
-----------------
- Added BSON serializer ignoreUndefined option for insert/update/remove/command/cursor.

1.2.12 09-08-2015
-----------------
- NODE-541 Added initial support for readConcern.

1.2.11 08-31-2015
-----------------
- NODE-535 If connectWithNoPrimary is true then primary-only connection is not allowed.
- NODE-534 Passive secondaries are not allowed for secondaryOnlyConnectionAllowed.
- Fixed filtering bug for logging (Issue 30, https://github.com/christkv/mongodb-core/issues/30).

1.2.10 08-14-2015
-----------------
- Added missing Mongos.prototype.parserType function.

1.2.9 08-05-2015
----------------
- NODE-525 Reset connectionTimeout after it's overwritten by tls.connect.
- NODE-518 connectTimeoutMS is doubled in 2.0.39.

1.2.8 07-24-2015
-----------------
- Minor fix to handle 2.4.x errors better by correctly return driver layer issues.

1.2.7 07-16-2015
-----------------
- Refactoring to allow to tap into find/getmore/killcursor in cursors for APM monitoring in driver.

1.2.6 07-14-2015
-----------------
- NODE-505 Query fails to find records that have a 'result' property with an array value.

1.2.5 07-14-2015
-----------------
- NODE-492 correctly handle hanging replicaset monitoring connections when server is unavailable due to network partitions or firewalls dropping packets, configureable using the connectionTimeoutMS setting.

1.2.4 07-07-2015
-----------------
- NODE-493 staggering the socket connections to avoid overwhelming the mongod process.

1.2.3 06-26-2015
-----------------
- Minor bug fixes.

1.2.2 06-22-2015
-----------------
- Fix issue with SCRAM authentication causing authentication to return true on failed authentication (Issue 26, https://github.com/cglass17).

1.2.1 06-17-2015
-----------------
- Ensure serializeFunctions passed down correctly to wire protocol.

1.2.0 06-17-2015
-----------------
- Switching to using the 0.4.x pure JS serializer, removing dependency on C++ parser.
- Refactoring wire protocol messages to avoid expensive size calculations of documents in favor of writing out an array of buffers to the sockets.
- NODE-486 fixed issue related to limit and skip when calling toArray in 2.0 driver.
- NODE-483 throw error if capabilities of topology is queries before topology has performed connection setup.
- NODE-487 fixed issue where killcursor command was not being sent correctly on limit and skip queries.

1.1.33 05-31-2015
-----------------
- NODE-478 Work around authentication race condition in mongos authentication due to multi step authentication methods like SCRAM.

1.1.32 05-20-2015
-----------------
- After reconnect, it updates the allowable reconnect retries to the option settings (Issue #23, https://github.com/owenallenaz)

1.1.31 05-19-2015
-----------------
- Minor fixes for issues with re-authentication of mongos.

1.1.30 05-18-2015
-----------------
- Correctly emit 'all' event when primary + all secondaries have connected.

1.1.29 05-17-2015
-----------------
- NODE-464 Only use a single socket against arbiters and hidden servers.
- Ensure we filter out hidden servers from any server queries.

1.1.28 05-12-2015
-----------------
- Fixed buffer compare for electionId for < node 12.0.2

1.1.27 05-12-2015
-----------------
- NODE-455 Update SDAM specification support to cover electionId and Mongos load balancing.

1.1.26 05-06-2015
-----------------
- NODE-456 Allow mongodb-core to pipeline commands (ex findAndModify+GLE) along the same connection and handle the returned results.
- Fixes to make mongodb-core work for node 0.8.x when using scram and setImmediate.

1.1.25 04-24-2015
-----------------
- Handle lack of callback in crud operations when returning error on application closed.

1.1.24 04-22-2015
-----------------
- Error out when topology has been destroyed either by connection retries being exhausted or destroy called on topology.

1.1.23 04-15-2015
-----------------
- Standardizing mongoErrors and its API (Issue #14)
- Creating a new connection is slow because of 100ms setTimeout() (Issue #17, https://github.com/vkarpov15)
- remove mkdirp and rimraf dependencies (Issue #12)
- Updated default value of param options.rejectUnauthorized to match documentation (Issue #16)
- ISSUE: NODE-417 Resolution. Improving behavior of thrown errors (Issue #14, https://github.com/owenallenaz)
- Fix cursor hanging when next() called on exhausted cursor (Issue #18, https://github.com/vkarpov15)

1.1.22 04-10-2015
-----------------
- Minor refactorings in cursor code to make extending the cursor simpler.
- NODE-417 Resolution. Improving behavior of thrown errors using Error.captureStackTrace.

1.1.21 03-26-2015
-----------------
- Updated bson module to 0.3.0 that extracted the c++ parser into bson-ext and made it an optional dependency.

1.1.20 03-24-2015
-----------------
- NODE-395 Socket Not Closing, db.close called before full set finished initalizing leading to server connections in progress not being closed properly.

1.1.19 03-21-2015
-----------------
- Made kerberos module ~0.0 to allow for quicker releases due to io.js of kerberos module.

1.1.18 03-17-2015
-----------------
- Added support for minHeartbeatFrequencyMS on server reconnect according to the SDAM specification.

1.1.17 03-16-2015
-----------------
- NODE-377, fixed issue where tags would correctly be checked on secondary and nearest to filter out eligible server candidates.

1.1.16 03-06-2015
-----------------
- rejectUnauthorized parameter is set to true for ssl certificates by default instead of false.

1.1.15 03-04-2015
-----------------
- Removed check for type in replset pickserver function.

1.1.14 02-26-2015
-----------------
- NODE-374 correctly adding passive secondaries to the list of eligable servers for reads

1.1.13 02-24-2015
-----------------
- NODE-365 mongoDB native node.js driver infinite reconnect attempts (fixed issue around handling of retry attempts)

1.1.12 02-16-2015
-----------------
- Fixed cursor transforms for buffered document reads from cursor.

1.1.11 02-02-2015
-----------------
- Remove the required setName for replicaset connections, if not set it will pick the first setName returned.

1.1.10 31-01-2015
-----------------
- Added tranforms.doc option to cursor to allow for pr. document transformations.

1.1.9 21-01-2015
----------------
- Updated BSON dependency to 0.2.18 to fix issues with io.js and node.
- Updated Kerberos dependency to 0.0.8 to fix issues with io.js and node.
- Don't treat findOne() as a command cursor.
- Refactored out state changes into methods to simplify read the next method.

1.1.8 09-12-2015
----------------
- Stripped out Object.defineProperty for performance reasons
- Applied more performance optimizations.
- properties cursorBatchSize, cursorSkip, cursorLimit are not methods setCursorBatchSize/cursorBatchSize, setCursorSkip/cursorSkip, setCursorLimit/cursorLimit

1.1.7 18-12-2014
----------------
- Use ns variable for getMore commands for command cursors to work properly with cursor version of listCollections and listIndexes.

1.1.6 18-12-2014
----------------
- Server manager fixed to support 2.2.X servers for travis test matrix.

1.1.5 17-12-2014
----------------
- Fall back to errmsg when creating MongoError for command errors

1.1.4 17-12-2014
----------------
- Added transform method support for cursor (initially just for initial query results) to support listCollections/listIndexes in 2.8.
- Fixed variable leak in scram.
- Fixed server manager to deal better with killing processes.
- Bumped bson to 0.2.16.

1.1.3 01-12-2014
----------------
- Fixed error handling issue with nonce generation in mongocr.
- Fixed issues with restarting servers when using ssl.
- Using strict for all classes.
- Cleaned up any escaping global variables.

1.1.2 20-11-2014
----------------
- Correctly encoding UTF8 collection names on wire protocol messages.
- Added emitClose parameter to topology destroy methods to allow users to specify that they wish the topology to emit the close event to any listeners.

1.1.1 14-11-2014
----------------
- Refactored code to use prototype instead of privileged methods.
- Fixed issue with auth where a runtime condition could leave replicaset members without proper authentication.
- Several deopt optimizations for v8 to improve performance and reduce GC pauses.

1.0.5 29-10-2014
----------------
- Fixed issue with wrong namespace being created for command cursors.

1.0.4 24-10-2014
----------------
- switched from using shift for the cursor due to bad slowdown on big batchSizes as shift causes entire array to be copied on each call.

1.0.3 21-10-2014
----------------
- fixed error issuing problem on cursor.next when iterating over a huge dataset with a very small batchSize.

1.0.2 07-10-2014
----------------
- fullsetup is now defined as a primary and secondary being available allowing for all read preferences to be satisfied.
- fixed issue with replset_state logging.

1.0.1 07-10-2014
----------------
- Dependency issue solved

1.0.0 07-10-2014
----------------
- Initial release of mongodb-core
