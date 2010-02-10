/**
  Request id generator
**/
exports.RequestIdGenerator = Class({
})
// requestID incrementing global vaue for BaseCommand for unique query identifier
exports.RequestIdGenerator.requestID = 1;
exports.RequestIdGenerator.normalizeValue = new Date().getTime();
exports.RequestIdGenerator.getRequestId = function() {
  // Increment request id
  exports.RequestIdGenerator.requestID = exports.RequestIdGenerator.requestID + 1;
  var requestId = exports.RequestIdGenerator.requestID;
  return requestId;
}