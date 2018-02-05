'use strict';

const getReadPreference = require('../shared').getReadPreference;
const Msg = require('../../connection/msg').Msg;

function executeFind(bson, ns, cmd, cursorState, topology, options) {
  // Ensure we have at least some options
  options = options || {};
  // Get the readPreference
  const readPreference = getReadPreference(cmd, options);
  // Set the optional batchSize
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  // Get name of database
  const parts = ns.split(/\./);
  const $db = parts.shift();

  // Build actual find command
  let findCmd = { $db, find: parts.join('.') };

  // I we provided a filter
  if (cmd.query) {
    findCmd.filter = cmd.query['$query'] || cmd.query;
  }

  [
    'fields',
    'hint',
    'skip',
    'limit',
    'comment',
    'maxScan',
    'maxTimeMS',
    'min',
    'max',
    'returnKey',
    'showDiskLoc',
    'snapshot',
    'tailable',
    'oplogReplay',
    'noCursorTimeout',
    'collation'
  ].forEach(key => {
    if (cmd[key]) {
      findCmd[key] = cmd[key];
    }
  });

  const sort = parseSortField(cmd.sort);

  // Add sort to command
  if (sort) findCmd.sort = sort;

  // If we have awaitData set
  if (cmd.awaitData) findCmd.awaitData = cmd.awaitData;
  if (cmd.awaitdata) findCmd.awaitData = cmd.awaitdata;

  // If we have explain, we need to rewrite the find command
  // to wrap it in the explain command
  if (cmd.explain) {
    findCmd = {
      explain: findCmd
    };
  }

  // Did we provide a readConcern
  if (cmd.readConcern) findCmd.readConcern = cmd.readConcern;

  // Set up the serialize and ignoreUndefined fields
  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
    findCmd = {
      $query: findCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  return new Msg(bson, findCmd, { serializeFunctions, ignoreUndefined, checkKeys: false });
}

function parseSortField(sort) {
  if (!Array.isArray(sort)) {
    return sort;
  }

  // Handle issue of sort being an Array
  const sortObject = {};

  if (sort.length > 0 && !Array.isArray(sort[0])) {
    var sortDirection = sort[1];
    // Translate the sort order text
    if (sortDirection === 'asc') {
      sortDirection = 1;
    } else if (sortDirection === 'desc') {
      sortDirection = -1;
    }

    // Set the sort order
    sortObject[sort[0]] = sortDirection;
  } else {
    for (var i = 0; i < sort.length; i++) {
      sortDirection = sort[i][1];
      // Translate the sort order text
      if (sortDirection === 'asc') {
        sortDirection = 1;
      } else if (sortDirection === 'desc') {
        sortDirection = -1;
      }

      // Set the sort order
      sortObject[sort[i][0]] = sortDirection;
    }
  }

  return sortObject;
}

module.exports = executeFind;
