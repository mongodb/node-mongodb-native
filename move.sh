#!/bin/bash
set +x

for i in $(find lib -iname "*.js"); do
  to=$(echo $i | sed 's+^lib+src+')
  to_suffix=$(echo $to | rev | cut -d '.' -f 2- | rev).ts
  mkdir -p `dirname $to_suffix`
  git mv "$i" "$to_suffix" 
done

