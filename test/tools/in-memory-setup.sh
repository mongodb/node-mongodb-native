#!/bin/sh

if [ "$#" -ne 2 ]; then
    echo "usage: in-memory-setup <location> <size in gb>"
    echo "override <DATA_DIR | SINGLE_DIR | REPLICASET_DIR | SHARDED_DIR> env variables to change dbPath"
    exit
fi

TOTAL_BYTES=$(($2 * 1000000000))
NUMSECTORS=$((TOTAL_BYTES / 512)) # a sector is 512 bytes
mydev=$(hdiutil attach -nomount ram://$NUMSECTORS)
newfs_hfs $mydev
mkdir ./data
mount -t hfs $mydev data
