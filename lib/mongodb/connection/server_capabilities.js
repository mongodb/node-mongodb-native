var ServerCapabilities = function(isMasterResult) {  
  // Capabilities
  var aggregationCursor = false;
  var writeCommands = false;
  var textSearch = false;

  if(isMasterResult.minWireVersion >= 0) {
  	textSearch = true;
  }

  if(isMasterResult.maxWireVersion >= 1) {
  	aggregationCursor = true;
  	writeCommands = true;
  }

  // Map up read only parameters
  setup_get_property(this, "hasAggregationCursor", aggregationCursor);
  setup_get_property(this, "hasWriteCommands", writeCommands);
  setup_get_property(this, "hasTextSearch", textSearch);
}

var setup_get_property = function(object, name, value) {
  Object.defineProperty(object, name, {
      enumerable: true
    , get: function () { return value; }
  });  
}

exports.ServerCapabilities = ServerCapabilities;