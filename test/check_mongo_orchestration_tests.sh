#!/bin/bash
result=`which mongo-orchestration`
if [[ ! -z "$result" ]]; then
  echo Path to Mongo-Orchestration:
  echo $result
else
  echo Warning: please install mongo-orchestration.
fi
