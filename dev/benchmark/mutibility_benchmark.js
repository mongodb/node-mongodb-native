var ImmutablePreCursor = function() {  
}

ImmutablePreCursor.prototype.match = function(match) {
  return {match: match, sort:this.sort, limit:this.limit};
}

ImmutablePreCursor.prototype.sort = function(sort) {
  return {match: this.match, sort:sort, limit:this.limit};
}

ImmutablePreCursor.prototype.limit = function(limit) {
  return {match: this.match, sort:this.sort, limit:limit};
}

var Collection = function() {  
}

// Immutable find 
Collection.prototype.find = function() {
  return new ImmutablePreCursor();
} 

// Number of warm up iterations
var warm_up = 1000000;
var benchmark_rounds = 1000000;

// Benchmark Immutable (warm up)
for(var i = 0; i < warm_up; i++) {
  new Collection().find().match({a:1}).sort({a:-1}).limit(1000)
}

// Start benchmark
var start = new Date().getTime();

for(var i = 0; i < benchmark_rounds; i++) {
  new Collection().find().match({a:1}).sort({a:-1}).limit(1000)
}

var end = new Date().getTime();

console.log("================================== results");
console.log("immutable time = " + (end - start));
console.log("ops/s = " + (benchmark_rounds/(end - start)) * 1000);

var MutablePreCursor = function() {  
}

MutablePreCursor.prototype.match = function(match) {
  this.match = match
  return this;
}

MutablePreCursor.prototype.sort = function(sort) {
  this.sort = sort
  return this;
}

MutablePreCursor.prototype.limit = function(limit) {
  this.limit = limit
  return this;
}

var Collection = function() {  
}

// Immutable find 
Collection.prototype.find = function() {
  return new MutablePreCursor();
} 

// Number of warm up iterations
var warm_up = 1000000;
var benchmark_rounds = 1000000;

// Benchmark Immutable (warm up)
for(var i = 0; i < warm_up; i++) {
  new Collection().find().match({a:1}).sort({a:-1}).limit(1000)
}

// Start benchmark
var start = new Date().getTime();

for(var i = 0; i < benchmark_rounds; i++) {
  new Collection().find().match({a:1}).sort({a:-1}).limit(1000)
}

var end = new Date().getTime();

console.log("================================== results")
console.log("mutable time = " + (end - start))
console.log("ops/s = " + (benchmark_rounds/(end - start)) * 1000)









