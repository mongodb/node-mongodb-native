+++
date = "2015-03-18T16:56:14Z"
title = "Issues & Help"
[menu.main]
  weight = 100
  pre = "<i class='fa fa-life-ring'></i>"
+++

# Issues & Help

Our developer community is vibrant and highly engaged, with wide experience using Node.js with MongoDB.
Often, the quickest way to get support for
general questions is through the [mongodb-user google group](http://groups.google.com/group/mongodb-user)
or through [stackoverflow](http://stackoverflow.com/questions/tagged/mongodb+nodejs).  
Refer to our [support channels](http://www.mongodb.org/about/support) documentation for more information.

## Bugs / Feature Requests

To report a bug or to request a new feature in the Node.js driver,
please open a case in our issue management tool, JIRA:

- [Create an account and login](https://jira.mongodb.org).
- Navigate to [the NODE project](https://jira.mongodb.org/browse/NODE).
- Click **Create Issue**. Provide as much information as possible about the
issue and the steps to reproduce it.

Bug reports in JIRA for the Node.js driver and the Core Server (i.e. SERVER) project are **public**.

If you’ve identified a security vulnerability in a driver or any other
MongoDB project, please report it according to the instructions found in the [Create a Vulnerability Report](http://docs.mongodb.org/manual/tutorial/create-a-vulnerability-report).

## Pull Requests

We are happy to accept contributions to help improve the driver.
We will review user contributions to ensure they meet the standards of the codebase.
Pull requests must pass the travis.ci checks as well as include documentation
and tests.

To get started check out the source and work on a branch:

```bash
$ git clone https://github.com/mongodb/node-mongodb-native.git
$ cd node-mongodb-native
$ npm install
$ git checkout -b myNewFeature
```

To run the test suite, you must have the `mongod` executable in your current
path.

Run the functional test suite.
```bash
$ node test/runner.js -t functional
```
