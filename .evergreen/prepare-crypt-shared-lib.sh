MONGODB_VERSION=${VERSION}
if [ -z "$MONGODB_VERSION" ]; then
  # default to latest to match behavior of run-orchestration.sh.
  MONGODB_VERSION=latest
fi

. $DRIVERS_TOOLS/.evergreen/download-mongodb.sh
get_distro
# get_distro defines $DISTRO.
echo "distro='$DISTRO' version='$MONGODB_VERSION'".
get_mongodb_download_url_for "$DISTRO" "$MONGODB_VERSION"
# get_mongodb_download_url_for defines $MONGO_CRYPT_SHARED_DOWNLOAD_URL and $EXTRACT.
if [ -z "$MONGO_CRYPT_SHARED_DOWNLOAD_URL" ]; then
  echo "There is no crypt_shared library for distro='$DISTRO' and version='$MONGODB_VERSION'".
else
  echo "Downloading crypt_shared package from $MONGO_CRYPT_SHARED_DOWNLOAD_URL"
  download_and_extract_crypt_shared "$MONGO_CRYPT_SHARED_DOWNLOAD_URL" "$EXTRACT"
  CRYPT_SHARED_LIB_PATH="$(find $(pwd) -maxdepth 1 -type f \
    -name 'mongo_crypt_v1.so' -o \
    -name 'mongo_crypt_v1.dll' -o \
    -name 'mongo_crypt_v1.dylib')"
  # Expect that we always find a crypt_shared library file and set the CRYPT_SHARED_LIB_PATH
  # environment variable. If we didn't, print an error message and exit.
  if [ -z "$CRYPT_SHARED_LIB_PATH" ]; then
    echo 'CRYPT_SHARED_LIB_PATH is empty. Exiting.'
    exit 1
  fi
  # If we're on Windows, convert the "cygdrive"  path to Windows-style paths.
  if [ "Windows_NT" = "$OS" ]; then
    CRYPT_SHARED_LIB_PATH=$(cygpath -m $CRYPT_SHARED_LIB_PATH)
  fi
  echo "CRYPT_SHARED_LIB_PATH: $CRYPT_SHARED_LIB_PATH"
  echo "export CRYPT_SHARED_LIB_PATH=$CRYPT_SHARED_LIB_PATH" >crypt_shared.sh
fi
