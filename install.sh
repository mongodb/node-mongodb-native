#!/bin/bash
echo "================================================================================"
echo "=                                                                              ="
echo "=  To install with C++ bson parser do <npm install mongodb --mongodb:native>   ="
echo "=  the parser only works for node 0.4.X or lower                               ="
echo "=                                                                              ="
echo "================================================================================"
echo "Not building native library for cygwin"
if [ x`which gmake` != "x" ]; then
  echo "Using GNU make";

  if [ $npm_package_config_native = "true" ]; then
    gmake total
  fi    
else
  
  if [ $npm_package_config_native = "true" ]; then
    make total
  fi
fi
