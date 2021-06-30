#! /bin/bash

echo "Building svgs..."
cd mermaid
for f in *.mmd
do
  echo "Processing $f"
  outname="${f%%.*}"
  mmdc -i $f -o ../imgs/$outname.svg &
done
wait

echo "Done"
