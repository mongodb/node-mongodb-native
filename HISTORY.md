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
