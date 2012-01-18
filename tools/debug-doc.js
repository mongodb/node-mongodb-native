var fs = require('fs');

var docDirectory = "./build";
// Fetch all the json objects
var files = fs.readdirSync(docDirectory);
// Print all json objects
for(var i = 0; i < files.length; i++) {
  var file = files[i];
  
  if(file.indexOf('.json') != -1) {
    var jsonFile = fs.readFileSync(docDirectory + "/" + file);
    var object = JSON.parse(jsonFile.toString());
    console.log("====================================================== Content of :: " + file);
    if(Array.isArray(object)) {
      for(var i = 0; i < object.length; i++) {
        var item = object[i];        
        console.log("---------------------------------------------------- item");
        console.dir(item);
        // console.dir(item.tags)
      }
    }
    // console.dir(object);
  }
}
