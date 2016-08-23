2.0.10 2016-08-23
-----------------
* Added promoteValues flag (default to true) to allow user to specify they only want wrapped BSON values back instead of promotion to native types.
* Do not close mongos proxy connection on failed ismaster check in ha process (Issue #130).

2.0.9 2016-08-19
----------------
* Allow promoteLongs to be passed in through Response.parse method and overrides default set on the connection.
* NODE-798 Driver hangs on count command in replica set with one member.
* Allow promoteLongs to be passed in through Response.parse method and overrides default set on the connection.
* Allow passing in servername for TLS connections for SNI support.

2.0.8 2016-08-16
----------------
* Allow execution of store operations indepent of having both a primary and secondary available (Issue #123).
* Fixed command execution issue for mongos to ensure buffering of commands when no mongos available.
* Added hashed connection names and fullResult.
* Updated bson library to 0.5.3.
* Wrap callback in nextTick to ensure exceptions are thrown correctly.

2.0.7 2016-07-28
----------------
* Allow primary to be returned when secondaryPreferred is passed (Issue #117, https://github.com/dhendo).
* Added better warnings when passing in illegal seed list members to a Mongos topology.
* Minor attemptReconnect bug that would cause multiple attemptReconnect to run in parallel.
* Fix wrong opType passed to disconnectHandler.add (Issue #121, https://github.com/adrian-gierakowski)
* Implemented domain backward comp support enabled via domainsEnabled options on Server/ReplSet/Mongos and MongoClient.connect.
* Initial max staleness implementation for ReplSet and Mongos for 3.4 support.
* Added handling of collation for 3.4 support.

2.0.6 2016-07-19
----------------
* Destroy connection on socket timeout due to newer node versions not closing the socket.

2.0.5 2016-07-15
----------------
* Minor fixes to handle faster MongoClient connectivity from the driver, allowing single server instances to detect if they are a proxy.
* Added numberOfConsecutiveTimeouts to pool that will destroy the pool if the number of consecutive timeouts > reconnectTries.
* Print warning if seedlist servers host name does not match the one provided in it's ismaster.me field for Replicaset members.
* Fix issue where Replicaset connection would not succeeed if there the replicaset was a single primary server setup.

2.0.4 2016-07-11
-----------------
* Updated bson to version 0.5.1.
* handle situation where user is providing seedlist names that do not match host list. fix allows for a single full discovery connection sweep before erroring out.
* NODE-747 Polyfill for Object.assign for 0.12.x or 0.10.x.
* NODE-746 Improves replicaset errors for wrong setName.

2.0.3 2016-07-08
-----------------
* Implemented Server Selection Specification test suite.
* Added warning level to logger.
* Added warning message when sockeTimeout < haInterval for Replset/Mongos.

2.0.2 2016-07-06
-----------------
* Mongos emits close event on no proxies available or when reconnect attempt fails.
* Replset emits close event when no servers available or when attemptReconnect fails to reconnect.
* Don't throw in auth methods but return error in callback.

2.0.1 2016-07-05
-----------------
* Added missing logout method on mongos proxy topology.
* Fixed logger error serialization issue.
* Documentation fixes.

2.0.0 2016-07-05
-----------------
* Moved all authentication and handling of growing/shrinking of pool connections into actual pool.
* All authentication methods now handle both auth/reauthenticate and logout events.
* Introduced logout method to get rid of onAll option for logout command.
* Updated bson to 0.5.0 that includes Decimal128 support.

1.3.21 2016-05-30
-----------------
* Pool gets stuck if a connection marked for immediateRelease times out (Issue #99, https://github.com/nbrachet).
* Make authentication process retry up to authenticationRetries at authenticationRetryIntervalMS interval.
* Made ismaster replicaset calls operate with connectTimeout or monitorSocketTimeout to lower impact of big socketTimeouts on monitoring performance.
* Make sure connections mark as "immediateRelease" don't linger the inUserConnections list. Otherwise, after that connection times out, getAll() incorrectly returns more connections than are effectively present, causing the pool to not get restarted by reconnectServer. (Issue #99, https://github.com/nbrachet).
* Make cursor getMore or killCursor correctly trigger pool reconnect to single server if pool has not been destroyed.
* Make ismaster monitoring for single server connection default to avoid user confusion due to change in behavior.

1.3.20 2016-05-25
-----------------
* NODE-710 Allow setting driver loggerLevel and logger function from MongoClient options.
* Minor fix for SSL errors on connection attempts, minor fix to reconnect handler for the server.
* Don't write to socket before having registered the callback for commands, work around for windows issuing error events twice on node.js when socket gets destroyed by firewall.
* Fix minor issue where connectingServers would not be removed correctly causing single server connections to not auto-reconnect.

1.3.19 2016-05-17
-----------------
- Handle situation where a server connection in a replicaset sometimes fails to be destroyed properly due to being in the middle of authentication when the destroy method is called on the replicaset causing it to be orphaned and never collected.
- Set keepAlive to false by default to work around bug in node.js for Windows XP and Windows 2003.
- Ensure replicaset topology destroy is never called by SDAM.
- Ensure all paths are correctly returned on inspectServer in replset.

1.3.18 2016-04-27
-----------------
- Hardened cursor connection handling for getMore and killCursor to ensure mid operation connection kill does not throw null exception.
- Fixes for Node 6.0 support.

1.3.17 2016-04-26
-----------------
- Added improved handling of reconnect when topology is a single server.
- Added better handling of $query queries passed down for 3.2 or higher.
- Introduced getServerFrom method to topologies to let cursor grab a new pool for getMore and killCursors commands and not use connection pipelining.
- NODE-693 Move authentication to be after ismaster call to avoid authenticating against arbiters.

1.3.16 2016-04-07
-----------------
- Only call unref on destroy if it exists to ensure proper working destroy method on early node v0.10.x versions.

1.3.15 2016-04-06
-----------------
- NODE-687 Fixed issue where a server object failed to be destroyed if the replicaset state did not update successfully. This could leave active connections accumulating over time.
- Fixed some situations where all connections are flushed due to a single connection in the connection pool closing.

1.3.14 2016-04-01
-----------------
- Ensure server inquireServerState exits immediately on server.destroy call.
- Refactored readPreference handling in 2.4, 2.6 and 3.2 wire protocol handling.

1.3.13 2016-03-30
-----------------
- Handle missing cursor on getMore when going through a mongos proxy by pinning to socket connection and not server.

1.3.12 2016-03-29
-----------------
- Mongos pickProxies fall back to closest mongos if no proxies meet latency window specified.

1.3.11 2016-03-29
-----------------
- isConnected method for mongos uses same selection code as getServer.
- Exceptions in cursor getServer trapped and correctly delegated to high level handler.

1.3.10 2016-03-22
-----------------
- SDAM Monitoring emits diff for Replicasets to simplify detecting the state changes.
- SDAM Monitoring correctly emits Mongos as serverDescriptionEvent.

1.3.9 2016-03-20
----------------
- Removed monitoring exclusive connection, should resolve timeouts and reconnects on idle replicasets where haInteval > socketTimeout.

1.3.8 2016-03-18
----------------
- Implements the SDAM monitoring specification.
- Fix issue where cursor would error out and not be buffered when primary is not connected.

1.3.7 2016-03-16
----------------
- Fixed issue with replicasetInquirer where it could stop performing monitoring if there was no servers available.

1.3.6 2016-03-15
----------------
- Fixed raise condition where multiple replicasetInquirer operations could be started in parallel creating redundant connections.

1.3.5 2016-03-14
----------------
- Handle rogue SSL exceptions (Issue #85, https://github.com/durran).

1.3.4 2016-03-14
----------------
- Added unref options on server, replicaset and mongos (Issue #81, https://github.com/allevo)
- cursorNotFound flag always false (Issue #83, https://github.com/xgfd)
- refactor of events emission of fullsetup and all events (Issue #84, https://github.com/xizhibei)

1.3.3 2016-03-08
----------------
- Added support for promoteLongs option for command function.
- Return connection if no callback available
- Emit connect event when server reconnects after initial connection failed (Issue #76, https://github.com/vkarpov15)
- Introduced optional monitoringSocketTimeout option to allow better control of SDAM monitoring timeouts.
- Made monitoringSocketTimeout default to 30000 if no connectionTimeout value specified or if set to 0.
- Fixed issue where tailable cursor would not retry even though cursor was still alive.
- Disabled exhaust flag support to avoid issues where users could easily write code that would cause memory to run out.
- Handle the case where the first command result document returns an empty list of documents but a live cursor.
- Allow passing down off CANONICALIZE_HOST_NAME and SERVICE_REALM options for kerberos.

1.3.2 2016-02-09
----------------
- Harden MessageHandler in server.js to avoid issues where we cannot find a callback for an operation.
- Ensure RequestId can never be larger than Max Number integer size.

1.3.1 2016-02-05
----------------
- Removed annoying missing Kerberos error (NODE-654).

1.3.0 2016-02-03
----------------
- Added raw support for the command function on topologies.
- Fixed issue where raw results that fell on batchSize boundaries failed (Issue #72)
- Copy over all the properties to the callback returned from bindToDomain, (Issue #72)
- Added connection hash id to be able to reference connection host/name without leaking it outside of driver.
- NODE-638, Cannot authenticate database user with utf-8 password.
- Refactored pool to be worker queue based, minimizing the impact a slow query have on throughput as long as # slow queries < # connections in the pool.
- Pool now grows and shrinks correctly depending on demand not causing a full pool reconnect.
- Improvements in monitoring of a Replicaset where in certain situations the inquiry process could get exited.
- Switched to using Array.push instead of concat for use cases of a lot of documents.
- Fixed issue where re-authentication could loose the credentials if whole Replicaset disconnected at once.
- Added peer optional dependencies support using require_optional module.

1.2.32 2016-01-12
-----------------
- Bumped bson to V0.4.21 to allow using minor optimizations.

1.2.31 2016-01-04
-----------------
- Allow connection to secondary if primaryPreferred or secondaryPreferred (Issue #70, https://github.com/leichter)

1.2.30 2015-12-23
-----------------
- Pool allocates size + 1 connections when using replicasets, reserving additional pool connection for monitoring exclusively.
- Fixes bug when all replicaset members are down, that would cause it to fail to reconnect using the originally provided seedlist.

1.2.29 2015-12-17
-----------------
- Correctly emit close event when calling destroy on server topology.

1.2.28 2015-12-13
-----------------
- Backed out Prevent Maximum call stack exceeded by calling all callbacks on nextTick, (Issue #64, https://github.com/iamruinous) as it breaks node 0.10.x support.

1.2.27 2015-12-13
-----------------
- Added [options.checkServerIdentity=true] {boolean|function}. Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function, (Issue #29).
- Prevent Maximum call stack exceeded by calling all callbacks on nextTick, (Issue #64, https://github.com/iamruinous).
- State is not defined in mongos, (Issue #63, https://github.com/flyingfisher).
- Fixed corner case issue on exhaust cursors on pre 3.0.x MongoDB.

1.2.26 2015-11-23
-----------------
- Converted test suite to use mongodb-topology-manager.
- Upgraded bson library to V0.4.20.
- Minor fixes for 3.2 readPreferences.

1.2.25 2015-11-23
-----------------
- Correctly error out when passed a seedlist of non-valid server members.

1.2.24 2015-11-20
-----------------
- Fix Automattic/mongoose#3481; flush callbacks on error, (Issue #57, https://github.com/vkarpov15).
- $explain query for wire protocol 2.6 and 2.4 does not set number of returned documents to -1 but to 0.

1.2.23 2015-11-16
-----------------
- ismaster runs against admin.$cmd instead of system.$cmd.

1.2.22 2015-11-16
-----------------
- Fixes to handle getMore command errors for MongoDB 3.2
- Allows the process to properly close upon a Db.close() call on the replica set by shutting down the haTimer and closing arbiter connections.

1.2.21 2015-11-07
-----------------
- Hardened the checking for replicaset equality checks.
- OpReplay flag correctly set on Wire protocol query.
- Mongos load balancing added, introduced localThresholdMS to control the feature.
- Kerberos now a peerDependency, making it not install it by default in Node 5.0 or higher.

1.2.20 2015-10-28
-----------------
- Fixed bug in arbiter connection capping code.
- NODE-599 correctly handle arrays of server tags in order of priority.
- Fix for 2.6 wire protocol handler related to readPreference handling.
- Added maxAwaitTimeMS support for 3.2 getMore to allow for custom timeouts on tailable cursors.
- Make CoreCursor check for $err before saying that 'next' succeeded (Issue #53, https://github.com/vkarpov15).

1.2.19 2015-10-15
-----------------
- Make batchSize always be > 0 for 3.2 wire protocol to make it work consistently with pre 3.2 servers.
- Locked to bson 0.4.19.

1.2.18 2015-10-15
-----------------
- Minor 3.2 fix for handling readPreferences on sharded commands.
- Minor fixes to correctly pass APM specification test suite.

1.2.17 2015-10-08
-----------------
- Connections to arbiters only maintain a single connection.

1.2.15 2015-10-06
-----------------
- Set slaveOk to true for getMore and killCursors commands.
- Don't swallow callback errors for 2.4 single server (Issue #49, https://github.com/vkarpov15).
- Apply toString('hex') to each buffer in an array when logging (Issue #48, https://github.com/nbrachet).

1.2.14 2015-09-28
-----------------
- NODE-547 only emit error if there are any listeners.
- Fixed APM issue with issuing readConcern.

1.2.13 2015-09-18
-----------------
- Added BSON serializer ignoreUndefined option for insert/update/remove/command/cursor.

1.2.12 2015-09-08
-----------------
- NODE-541 Added initial support for readConcern.

1.2.11 2015-08-31
-----------------
- NODE-535 If connectWithNoPrimary is true then primary-only connection is not allowed.
- NODE-534 Passive secondaries are not allowed for secondaryOnlyConnectionAllowed.
- Fixed filtering bug for logging (Issue 30, https://github.com/christkv/mongodb-core/issues/30).

1.2.10 2015-08-14
-----------------
- Added missing Mongos.prototype.parserType function.

1.2.9 2015-08-05
----------------
- NODE-525 Reset connectionTimeout after it's overwritten by tls.connect.
- NODE-518 connectTimeoutMS is doubled in 2.0.39.

1.2.8 2015-07-24
-----------------
- Minor fix to handle 2.4.x errors better by correctly return driver layer issues.

1.2.7 2015-07-16
-----------------
- Refactoring to allow to tap into find/getmore/killcursor in cursors for APM monitoring in driver.

1.2.6 2015-07-14
-----------------
- NODE-505 Query fails to find records that have a 'result' property with an array value.

1.2.5 2015-07-14
-----------------
- NODE-492 correctly handle hanging replicaset monitoring connections when server is unavailable due to network partitions or firewalls dropping packets, configureable using the connectionTimeoutMS setting.

1.2.4 2015-07-07
-----------------
- NODE-493 staggering the socket connections to avoid overwhelming the mongod process.

1.2.3 2015-06-26
-----------------
- Minor bug fixes.

1.2.2 2015-06-22
-----------------
- Fix issue with SCRAM authentication causing authentication to return true on failed authentication (Issue 26, https://github.com/cglass17).

1.2.1 2015-06-17
-----------------
- Ensure serializeFunctions passed down correctly to wire protocol.

1.2.0 2015-06-17
-----------------
- Switching to using the 0.4.x pure JS serializer, removing dependency on C++ parser.
- Refactoring wire protocol messages to avoid expensive size calculations of documents in favor of writing out an array of buffers to the sockets.
- NODE-486 fixed issue related to limit and skip when calling toArray in 2.0 driver.
- NODE-483 throw error if capabilities of topology is queries before topology has performed connection setup.
- NODE-487 fixed issue where killcursor command was not being sent correctly on limit and skip queries.

1.1.33 2015-05-31
-----------------
- NODE-478 Work around authentication race condition in mongos authentication due to multi step authentication methods like SCRAM.

1.1.32 2015-05-20
-----------------
- After reconnect, it updates the allowable reconnect retries to the option settings (Issue #23, https://github.com/owenallenaz)

1.1.31 2015-05-19
-----------------
- Minor fixes for issues with re-authentication of mongos.

1.1.30 2015-05-18
-----------------
- Correctly emit 'all' event when primary + all secondaries have connected.

1.1.29 2015-05-17
-----------------
- NODE-464 Only use a single socket against arbiters and hidden servers.
- Ensure we filter out hidden servers from any server queries.

1.1.28 2015-05-12
-----------------
- Fixed buffer compare for electionId for < node 12.0.2

1.1.27 2015-05-12
-----------------
- NODE-455 Update SDAM specification support to cover electionId and Mongos load balancing.

1.1.26 2015-05-06
-----------------
- NODE-456 Allow mongodb-core to pipeline commands (ex findAndModify+GLE) along the same connection and handle the returned results.
- Fixes to make mongodb-core work for node 0.8.x when using scram and setImmediate.

1.1.25 2015-04-24
-----------------
- Handle lack of callback in crud operations when returning error on application closed.

1.1.24 2015-04-22
-----------------
- Error out when topology has been destroyed either by connection retries being exhausted or destroy called on topology.

1.1.23 2015-04-15
-----------------
- Standardizing mongoErrors and its API (Issue #14)
- Creating a new connection is slow because of 100ms setTimeout() (Issue #17, https://github.com/vkarpov15)
- remove mkdirp and rimraf dependencies (Issue #12)
- Updated default value of param options.rejectUnauthorized to match documentation (Issue #16)
- ISSUE: NODE-417 Resolution. Improving behavior of thrown errors (Issue #14, https://github.com/owenallenaz)
- Fix cursor hanging when next() called on exhausted cursor (Issue #18, https://github.com/vkarpov15)

1.1.22 2015-04-10
-----------------
- Minor refactorings in cursor code to make extending the cursor simpler.
- NODE-417 Resolution. Improving behavior of thrown errors using Error.captureStackTrace.

1.1.21 2015-03-26
-----------------
- Updated bson module to 0.3.0 that extracted the c++ parser into bson-ext and made it an optional dependency.

1.1.20 2015-03-24
-----------------
- NODE-395 Socket Not Closing, db.close called before full set finished initalizing leading to server connections in progress not being closed properly.

1.1.19 2015-03-21
-----------------
- Made kerberos module ~0.0 to allow for quicker releases due to io.js of kerberos module.

1.1.18 2015-03-17
-----------------
- Added support for minHeartbeatFrequencyMS on server reconnect according to the SDAM specification.

1.1.17 2015-03-16
-----------------
- NODE-377, fixed issue where tags would correctly be checked on secondary and nearest to filter out eligible server candidates.

1.1.16 2015-03-06
-----------------
- rejectUnauthorized parameter is set to true for ssl certificates by default instead of false.

1.1.15 2015-03-04
-----------------
- Removed check for type in replset pickserver function.

1.1.14 2015-02-26
-----------------
- NODE-374 correctly adding passive secondaries to the list of eligable servers for reads

1.1.13 2015-02-24
-----------------
- NODE-365 mongoDB native node.js driver infinite reconnect attempts (fixed issue around handling of retry attempts)

1.1.12 2015-02-16
-----------------
- Fixed cursor transforms for buffered document reads from cursor.

1.1.11 2015-02-02
-----------------
- Remove the required setName for replicaset connections, if not set it will pick the first setName returned.

1.1.10 2015-31-01
-----------------
- Added tranforms.doc option to cursor to allow for pr. document transformations.

1.1.9 2015-21-01
----------------
- Updated BSON dependency to 0.2.18 to fix issues with io.js and node.
- Updated Kerberos dependency to 0.0.8 to fix issues with io.js and node.
- Don't treat findOne() as a command cursor.
- Refactored out state changes into methods to simplify read the next method.

1.1.8 2015-09-12
----------------
- Stripped out Object.defineProperty for performance reasons
- Applied more performance optimizations.
- properties cursorBatchSize, cursorSkip, cursorLimit are not methods setCursorBatchSize/cursorBatchSize, setCursorSkip/cursorSkip, setCursorLimit/cursorLimit

1.1.7 2014-18-12
----------------
- Use ns variable for getMore commands for command cursors to work properly with cursor version of listCollections and listIndexes.

1.1.6 2014-18-12
----------------
- Server manager fixed to support 2.2.X servers for travis test matrix.

1.1.5 2014-17-12
----------------
- Fall back to errmsg when creating MongoError for command errors

1.1.4 2014-17-12
----------------
- Added transform method support for cursor (initially just for initial query results) to support listCollections/listIndexes in 2.8.
- Fixed variable leak in scram.
- Fixed server manager to deal better with killing processes.
- Bumped bson to 0.2.16.

1.1.3 2014-01-12
----------------
- Fixed error handling issue with nonce generation in mongocr.
- Fixed issues with restarting servers when using ssl.
- Using strict for all classes.
- Cleaned up any escaping global variables.

1.1.2 2014-20-11
----------------
- Correctly encoding UTF8 collection names on wire protocol messages.
- Added emitClose parameter to topology destroy methods to allow users to specify that they wish the topology to emit the close event to any listeners.

1.1.1 2014-14-11
----------------
- Refactored code to use prototype instead of privileged methods.
- Fixed issue with auth where a runtime condition could leave replicaset members without proper authentication.
- Several deopt optimizations for v8 to improve performance and reduce GC pauses.

1.0.5 2014-29-10
----------------
- Fixed issue with wrong namespace being created for command cursors.

1.0.4 2014-24-10
----------------
- switched from using shift for the cursor due to bad slowdown on big batchSizes as shift causes entire array to be copied on each call.

1.0.3 2014-21-10
----------------
- fixed error issuing problem on cursor.next when iterating over a huge dataset with a very small batchSize.

1.0.2 2014-07-10
----------------
- fullsetup is now defined as a primary and secondary being available allowing for all read preferences to be satisfied.
- fixed issue with replset_state logging.

1.0.1 2014-07-10
----------------
- Dependency issue solved

1.0.0 2014-07-10
----------------
- Initial release of mongodb-core
