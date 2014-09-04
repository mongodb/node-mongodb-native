'use strict';

var f = require('util').format
  , fs = require('fs');
var conf = env.conf;
// Get the default indent
var indent = env.conf.examples && env.conf.examples.indent ? env.conf.examples.indent : 2;

// State for the plugin
var tests = {};
var currentClass = null;

exports.defineTags = function(dictionary) {
  dictionary.defineTag('example-class', {
      onTagged: function(doclet, tag) {
        if(!doclet.example) doclet.example = {};
        if(!tests[tag.text]) tests[tag.text] = {};
        // Current doclet scope
        doclet.example.class = tag.text;
      }
  });  

  dictionary.defineTag('example-method', {
      onTagged: function(doclet, tag) {
        if(!doclet.example) doclet.example = {};
        if(doclet.example.class) {
          doclet.example.method = tag.text;   
          tests[doclet.example.class][tag.text] = {
              method: tag.text
            , meta: doclet.meta
          }
        }
      }
  });  
}

var formatCode = function(object) {
  var strings = [];
  // Clean the description
  var parts = object.description.replace(/<p>|\<\/p\>/g, '').split('\n');
  parts = parts.map(function(x) {
    return f('// %s', x);
  });  
  strings.push(parts.join('\n'));

  // Clean the code itself
  var lines = object.code.split('\n');
  lines.shift();
  lines.pop();
  
  // Locate the first index
  // Trim left
  lines = lines.map(function(x) {
    return x.substr(indent);
  });

  // Replace statements
  var replacements = [];
  var removals = [];
  // Do we add the lines
  var addLines = false;
  // Execute template commands
  var finalLines = [];
  for(var i = 0; i < lines.length; i++) {
    // console.log(f("%d :: %s", i, lines[i]))
    if(lines[i].indexOf('// BEGIN') != -1) {
      addLines = true;
    } else if(lines[i].indexOf('// END') != -1) {
      addLines = false;
    } else if(lines[i].indexOf('// LINE') != -1) {
      finalLines.push(lines[i].split("// LINE ")[1]);
    } else if(lines[i].indexOf('// REMOVE-LINE') != -1) {
      removals.push(lines[i].split('// REMOVE-LINE ')[1]);
    } else if(lines[i].indexOf('// REPLACE') != -1) {
      var right = lines[i].split('// REPLACE ')[1];
      var parts = right.split(" WITH ");
      replacements.push({match: parts[0], replace: parts[1]});
    } else if(addLines) {
      var line = lines[i];
      // Do we add it
      var addLine = true;
      
      // Go through all the removals
      for(var j = 0; j < removals.length; j++) {
        if(line.indexOf(removals[j]) != -1) {
          addLine = false;
        }
      }

      // Go through all the replacements
      for(var j = 0; j < replacements.length; j++) {
        if(line.indexOf(replacements[j].match) != -1) {
          line = line.replace(replacements[j].match, replacements[j].replace);
        }
      }

      if(addLine) finalLines.push(line);
    }
  }
 
  // Add the cleaned code
  strings.push(finalLines.join('\n'));
  return strings.join('\n\n');
}

exports.handlers = {
    newDoclet: function(e) {
      // Do we have an annotated test
      if(e.doclet.example) {
        // console.log("------------------------------------------------ new doclet")
        // console.dir(e.doclet)

        // Get the method
        var filename = f("%s/%s", e.doclet.meta.path, e.doclet.meta.filename);
        // Read the whole file
        var data = fs.readFileSync(filename, 'utf8');
        // Get the substring
        var code = data.substr(e.doclet.meta.range[0], e.doclet.meta.range[1]);

        // Locate the test function and add it to the hash
        var classInstance = tests[e.doclet.example.class];
        var method = classInstance[e.doclet.example.method];
        method.description = e.doclet.description;
        method.code = code;
        // Null out the example
        delete e.doclet['example'];
      } else if(e.doclet.kind == 'class') {
        if(tests[e.doclet.name]) currentClass = tests[e.doclet.name];
      } else if(e.doclet.kind == 'function') {
        // Do we have a test
        if(currentClass && currentClass[e.doclet.name]) {
          if(e.doclet.examples == null) e.doclet.examples = [];
          // Create the content
          e.doclet.examples.push(formatCode(currentClass[e.doclet.name]));
        }
      }
    },

    fileComplete: function() {
      currentClass = null;
    }
}