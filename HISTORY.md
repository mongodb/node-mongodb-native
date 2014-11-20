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