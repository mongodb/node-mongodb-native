+++
date = "2015-03-19T14:27:51-04:00"
title = "Database Commands"
[menu.main]
  parent = "Tutorials"
  identifier = "Database Commands"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# Database Commands

Database commands allow you to perform a wide range of diagnostic and administrative
tasks with the Node.js driver. For example, the
[dbStats](https://docs.mongodb.org/manual/reference/command/dbStats/) command returns
storage statistics for a given database. Use the ``command`` function to access
database commands.

```js
// set up a command function
function getDbStats(db, callback) {
  db.command({'dbStats': 1}, function(err, results) {
    console.log(results);
    callback();
  });
};

// use the function
{{% myproject-connect %}}
  getDbStats(db, function() {
    client.close();
  });
});
```

For a complete list of database commands, see the [manual](https://docs.mongodb.org/manual/reference/command/).
