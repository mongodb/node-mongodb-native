---
date: 2013-07-01
linktitle: Introduction
menu:
  main:
    parent: getting started
next: /overview/installing
prev: /overview/quickstart
title: Driver introduction
weight: 10
---

## What is MongoDB Core

The MongoDB core driver is the minimal viable driver and contains no abstractions of any kind. It's the basis on what the 2.X or higher driver builds on.

## Who would use this ?

The target audience of this module are developers building higher level abstractions like ODM's, queue managers, caches and others where the additional layers of abstraction and helpers in the main driver is not needed. The lack of all of these abstractions should also help if you are trying to implement your own driver in another language or plan to write your own specialized MongoDB Node.js driver.

## Next Steps

 * [Install Driver](/overview/installing)
 * [Quick start](/overview/quickstart)
 * [Join the Mailing List](/community/mailing-list)
 * [Star us on GitHub](https://github.com/christkv/mongodb-core)
