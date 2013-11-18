var ServerCapabilities = function(isMasterResult) {  
  // Capabilities
  var aggregationCursor = false;
  var writeCommands = false;
  var textSearch = false;
  var authCommands = false;

  if(isMasterResult.minWireVersion >= 0) {
  	textSearch = true;
  }

  if(isMasterResult.maxWireVersion >= 1) {
  	aggregationCursor = true;
    authCommands = true;
  }

  if(isMasterResult.maxWireVersion >= 2) {
    writeCommands = true;
  }

  // If no min or max wire version set to 0
  if(isMasterResult.minWireVersion == null) {
    isMasterResult.minWireVersion = 0;
  }

  if(isMasterResult.maxWireVersion == null) {
    isMasterResult.maxWireVersion = 0;
  }

  // Map up read only parameters
  setup_get_property(this, "hasAggregationCursor", aggregationCursor);
  setup_get_property(this, "hasWriteCommands", writeCommands);
  setup_get_property(this, "hasTextSearch", textSearch);
  setup_get_property(this, "hasAuthCommands", authCommands);
  setup_get_property(this, "minWireVersion", isMasterResult.minWireVersion);
  setup_get_property(this, "maxWireVersion", isMasterResult.maxWireVersion);
}

var setup_get_property = function(object, name, value) {
  Object.defineProperty(object, name, {
      enumerable: true
    , get: function () { return value; }
  });  
}

exports.ServerCapabilities = ServerCapabilities;