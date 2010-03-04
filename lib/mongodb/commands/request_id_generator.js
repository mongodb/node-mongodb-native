/**
  Request id generator
**/
var RequestIdGenerator = exports.RequestIdGenerator = function(){};

// requestID incrementing global vaue for BaseCommand for unique query identifier
RequestIdGenerator.requestID = 1;
RequestIdGenerator.normalizeValue = new Date().getTime();
RequestIdGenerator.getRequestId = function() {
  // Increment request id
  RequestIdGenerator.requestID = RequestIdGenerator.requestID + 1;
  var requestId = RequestIdGenerator.requestID;
  return requestId;
};