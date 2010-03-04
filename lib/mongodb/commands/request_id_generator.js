/**
  Request id generator
  Returns a unique identifier for BaseCommand
**/

var id = 1;
exports.getRequestId = function(){
  return id++;
};