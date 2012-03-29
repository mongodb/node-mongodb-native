/**
 *  Parameters for the proxy
 **/
var inputHost = 'localhost';
var inputPort = 27017;
var outputHost = 'localhost';
var outputPort = 27018;
var webServerPort = 8080;
 
/**
 *  Proxy handling
 **/ 
var net = require('net'),
  http = require('http'),
  format = require('util').format;
var connectionNumber = 0,
  incomingConnections = {},
  outgoingConnections = {};

// Server instance
var server = net.createServer(function(connection) {
  console.log("=============================================== server connected");
  // console.dir(connection)
  // Set the id
  connection.id = connectionNumber++;
  // Outgoing connection
  var outgoingConnection = net.createConnection(outputPort, outputHost);
  outgoingConnection.id = connection.id;
  // Create a connection
  outgoingConnections[connection.id] = outgoingConnection;
  incomingConnections[connection.id] = connection;
  // Listen to incoming data
  connection.on("data", function(data) {
    outgoingConnections[this.id].write(data);
  });
  
  connection.on("close", function() {
    console.log("===================================== closing incoming connection :: " + this.id)
    if(outgoingConnections[this.id]) outgoingConnections[this.id].destroy();
    delete outgoingConnections[this.id];
  })
  
  outgoingConnections[connection.id].on("data", function(data) {
    incomingConnections[this.id].write(data);
  });  

  outgoingConnections[connection.id].on("close", function(data) {    
    console.log("===================================== closing outgoing connection :: " + this.id)
    if(incomingConnections[this.id]) incomingConnections[this.id].destroy();
    delete incomingConnections[this.id];
  });  
});

// Boot up server letting you control the connection
var webserver = http.createServer(function(request, response) {
  console.log("----------------------------------------------------------- 8080")
  // console.dir(request.url.)
  if(request.url == '/sockets') {
    renderSocketList(incomingConnections, response);
  } else if(request.url.indexOf('/sockets/close') != -1) {
    // Get the id and kill it
    var id = request.url.split("/").pop();
    id = id != null ? parseInt(id) : null;
    if(id != null && incomingConnections[id] != null) {
    }
    // Render the socket list
    renderSocketList(incomingConnections, response);    
  } else if(request.url.indexOf('/rest/kill_random_socket')) {
    // Grab all the connection ids
    var keys = Object.keys(incomingConnections);
    // Grab a random one in the space
    var id = keys[Math.floor(Math.random(keys.length))];
    // Terminate the connection
    
  } else {
    // Write 401 error out
    response.writeHead(401, { 'Content-Type': 'text/plain'});
    response.write("No such page found");
    response.end();    
  } 
});
// Listen
webserver.listen(webServerPort);

var renderSocketList = function(_incomingConnections, _response) {
  // Write out the list of available sockets we can kill if we wish
  _response.writeHead(200, { 'Content-Type': 'text/html'});
  // Map the array
  var socketids = Object.keys(_incomingConnections).map(function(item) {
    return format("<li>Socket %s <a href='/sockets/close/%s'>[Close]</a></li>", item, item);
  });
  // Write out the data
  _response.write(format("<head></head><body><ul>%s</ul></body>", socketids.join("")))    
  _response.end();      
}

var terminateConnection = function(id) {
  // Get the connections
  var incomingConnection = incomingConnections[id];
  var outgoingConnection = outgoingConnections[id];
  // Remove from the list
  delete incomingConnections[id];
  delete outgoingConnections[id];
  // Kill them
  incomingConnection.destroy();
  outgoingConnection.destroy();  
}

// Listen to port
server.listen(inputPort, inputHost, function() {
  console.log("server bound")
});