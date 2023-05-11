#!/usr/bin/env bash
set -o errexit  # Exit the script with error if any of the commands fail

NODE_LTS_NAME=${NODE_LTS_NAME:-fermium}
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY:-$(pwd)}/node-artifacts"
if [[ "$OS" = "Windows_NT" ]]; then NODE_ARTIFACTS_PATH=$(cygpath --unix "$NODE_ARTIFACTS_PATH"); fi

CURL_FLAGS=(
  --fail          # Exit code 1 if request fails
  --compressed    # Request a compressed response should keep fetching fast
  --location      # Follow a redirect
  --retry 8       # Retry HTTP 408, 429, 500, 502, 503 or 504, 8 times
  --silent        # Do not print a progress bar
  --show-error    # Despite the silent flag still print out errors
  --max-time 900  # 900 seconds is 15 minutes, evergreen times out at 20
  --continue-at - # If a download is interrupted it can figure out where to resume
)

mkdir -p "$NODE_ARTIFACTS_PATH/npm_global"

# Comparisons are all case insensitive
shopt -s nocasematch

# index.tab is a sorted tab separated values file with the following headers
# 0       1    2     3   4  5  6    7       8       9   10
# version date files npm v8 uv zlib openssl modules lts security
curl "${CURL_FLAGS[@]}" "https://nodejs.org/dist/index.tab" --output node_index.tab

while IFS=$'\t' read -r -a row; do
  node_index_version="${row[0]}"
  node_index_date="${row[1]}"
  node_index_lts="${row[9]}"
  [[ "$node_index_version" = "version" ]] && continue # skip tsv header
  [[ "$NODE_LTS_NAME" = "latest" ]] && break # first line is latest
  [[ "$NODE_LTS_NAME" = "$node_index_lts" ]] && break # case insensitive compare
done < node_index.tab

if [[ "$OS" = "Windows_NT" ]]; then
  operating_system="win"
elif [[ $(uname) = "darwin" ]]; then
  operating_system="darwin"
elif [[ $(uname) = "linux" ]]; then
  operating_system="linux"
else
  echo "Unable to determine operating system: $operating_system"
  exit 1
fi

architecture=$(uname -m)
if [[ $architecture = "x86_64" ]]; then
  architecture="x64"
elif [[ $architecture = "arm64" ]]; then
  architecture="arm64"
elif [[ $architecture = "aarch64" ]]; then
  architecture="arm64"
elif [[ $architecture == s390* ]]; then
  architecture="s390x"
elif [[ $architecture == ppc* ]]; then
  architecture="ppc64le"
else
  echo "Unable to determine operating system: $architecture"
  exit 1
fi

file_extension="tar.gz"
if [[ "$OS" = "Windows_NT" ]]; then file_extension="zip"; fi

node_directory="node-${node_index_version}-${operating_system}-${architecture}"
node_archive="${node_directory}.${file_extension}"
node_archive_path="$NODE_ARTIFACTS_PATH/${node_archive}"
node_download_url="https://nodejs.org/dist/${node_index_version}/${node_archive}"

echo "Node.js ${node_index_version} for ${operating_system}-${architecture} released on ${node_index_date}"

set -o xtrace

curl "${CURL_FLAGS[@]}" "${node_download_url}" --output "$node_archive_path"

if [[ "$file_extension" = "zip" ]]; then
  unzip -q "$node_archive_path" -d "${NODE_ARTIFACTS_PATH}"
  mkdir -p "${NODE_ARTIFACTS_PATH}/nodejs"
  # Windows "bins" are at the top level
  mv "${NODE_ARTIFACTS_PATH}/${node_directory}" "${NODE_ARTIFACTS_PATH}/nodejs/bin"
  # Need to add executable flag ourselves
  chmod +x "${NODE_ARTIFACTS_PATH}/nodejs/bin/node.exe"
  chmod +x "${NODE_ARTIFACTS_PATH}/nodejs/bin/npm"
else
  tar -xf "$node_archive_path" -C "${NODE_ARTIFACTS_PATH}"
  mv "${NODE_ARTIFACTS_PATH}/${node_directory}" "${NODE_ARTIFACTS_PATH}/nodejs"
fi

export PATH="$NODE_ARTIFACTS_PATH/npm_global/bin:$NODE_ARTIFACTS_PATH/nodejs/bin:$PATH"
hash -r

# Set npm -g prefix to our local artifacts directory
cat <<EOT > .npmrc
prefix=$NODE_ARTIFACTS_PATH/npm_global
EOT

if [[ $operating_system != "win" ]]; then
  # Update npm to latest when we can
  npm install --global npm@latest
  hash -r
fi

echo "npm version: $(npm -v)"

npm install "${NPM_OPTIONS}"
