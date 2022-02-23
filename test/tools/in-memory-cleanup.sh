#!/bin/sh

if [ "$#" -ne 1 ]; then
    echo "usage: in-memory-cleanup <location>"
    exit
fi

killall mongod 2> /dev/null
killall mongos 2> /dev/null
diskutil umount force $1
rm -rf $1
