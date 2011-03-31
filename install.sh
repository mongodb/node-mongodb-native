#!/bin/bash
if [ `uname -o` = "Cygwin" ]
then
  echo "Not building native library for cygwin"
elif [ `uname -o` = "Solaris" ]
then
  echo "Not building native library for solaris"
else
  make total
fi
