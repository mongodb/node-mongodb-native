#!/bin/bash

for i in `find . -iname '*.yml'`; do
    echo "${i%.*}"
    jwc yaml2json $i > ${i%.*}.json
done
