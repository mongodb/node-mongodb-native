# Stage 1: install general dependencies
# Separating the build into multiple stages lets Docker skip rebuilding previous stages, improving build times e.g. when only updating the entrypoint script
# `docker build --no-cache` to force a full rebuild, e.g. when new server versions are released

FROM ubuntu:bionic as mtools

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    nodejs-dev node-gyp npm curl \
    python3-pip python3-dev python3-setuptools python3-wheel \
    build-essential libssl1.0-dev \
  && rm -rf /var/lib/apt/lists/*

RUN pip3 install wheel
RUN pip3 install psutil pymongo mtools

# Stage 2: install m via npm and preload "hot" versions of MongoDB
# This allows a fresh container to skip downloading common versions of MongoDB, at the cost of increased image size

FROM mtools as mongo_preloaded

ENV MONGO_VERSION latest
ARG HOSTNAME

RUN npm install -g m

RUN mkdir /data

# preload mongo binaries
RUN m 3.6
RUN m 4.0
RUN m 4.2
RUN m 4.4
RUN m latest

# Stage 3: add entrypoint script

FROM mongo_preloaded

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Example usage:

# 1. Build the docker image and tag it as e.g. `docker-mongodb`
#    Then in the same folder as this Dockerfile, run
#
# > docker build -t [--no-cache] docker-mongodb .
# Note: passing --no-cache will force a full rebuild i.e. if a new version of the server is released; otherwise it should be omitted to reduce build time

# 2. Run the appropriate topology
#
# a) single
#
# > docker run --rm -d -p 27017:27017 -e MONGO_VERSION=4.2 -e HOSTNAME=$(hostname) docker-mongodb single
# Note: passing the hostname is required for the networking to work for a single server, but not for replica/sharded
#
# b) replica set
#
# > docker run --rm -d -p 31000-31003:31000-31003 -e MONGO_VERSION=3.6 docker-mongodb replica
#
# c) sharded cluster
#
# > docker run --rm -d -p 51000-51006:51000-51006 -e MONGO_VERSION=latest docker-mongodb sharded

# 3. See what's running
#
# > docker ps

# 4. Follow output
#
# > docker logs -f <container id from docker ps>

# 5. Run arbitrary mlaunch commands
#
# > docker run --rm -d -p 27017:27017 -e MONGO_VERSION=4.2 docker-mongodb mlaunch init --dir /data --bind_ip 0.0.0.0 --hostname $(hostname) --single --setParameter enableTestCommands=1
