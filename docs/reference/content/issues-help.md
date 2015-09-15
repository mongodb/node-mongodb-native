+++
date = "2015-03-18T16:56:14Z"
title = "Issues & Help"
[menu.main]
  weight = 100
  pre = "<i class='fa fa-life-ring'></i>"
+++

# Issues & Help

We are lucky to have a vibrant MongoDB Java community with lots of varying
experience of using the Java driver.  We often find the quickest way to get support for
general questions is through the [mongodb-user google group](http://groups.google.com/group/mongodb-user)
or through [stackoverflow](http://stackoverflow.com/questions/tagged/mongodb+java).  Please also
refer to our own [support channels](http://www.mongodb.org/about/support) documentation.

## Bugs / Feature Requests

If you think you’ve found a bug or want to see a new feature in the Java driver,
please open a case in our issue management tool, JIRA:

- [Create an account and login](https://jira.mongodb.org).
- Navigate to [the JAVA project](https://jira.mongodb.org/browse/JAVA).
- Click **Create Issue** - Please provide as much information as possible about the issue type and how to reproduce it.

Bug reports in JIRA for the Java driver and the Core Server (i.e. SERVER) project are **public**.

If you’ve identified a security vulnerability in a driver or any other
MongoDB project, please report it according to the [instructions here](http://docs.mongodb.org/manual/tutorial/create-a-vulnerability-report).

## Pull Requests

We are happy to accept contributions to help improve the driver.
We will guide user contributions to ensure they meet the standards of the codebase.
Please ensure that any pull requests include documentation, tests and also pass
a the gradle checks.

To get started check out the source and work on a branch:

```bash
$ git clone https://github.com/mongodb/mongo-java-driver.git
$ cd mongo-java-driver
$ git checkout -b myNewFeature
```

Finally, ensure that the code passes gradle checks.
```bash
$ ./gradlew check
```
