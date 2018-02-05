'use strict';

const getReadPreference = require('../shared').getReadPreference;
const Msg = require('../../connection/msg').Msg;

function setupCommand(bson, ns, cmd, cursorState, topology, options) {
  // Set empty options object
  options = options || {};
  // Get the readPreference
  const readPreference = getReadPreference(cmd, options);

  // Final query
  let finalCmd = {};
  for (let name in cmd) {
    finalCmd[name] = cmd[name];
  }

  // Build add db to command
  const parts = ns.split(/\./);
  finalCmd.$db = parts.shift();

  // Serialize functions
  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;

  // Set up the serialize and ignoreUndefined fields
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  // We have a Mongos topology, check if we need to add a readPreference
  if (topology.type === 'mongos' && readPreference && readPreference.preference !== 'primary') {
    finalCmd = {
      $query: finalCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  return new Msg(bson, finalCmd, { serializeFunctions, ignoreUndefined, checkKeys: false });
}

module.exports = setupCommand;
