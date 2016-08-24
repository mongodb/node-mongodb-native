+++
date = "2015-03-17T15:36:56Z"
title = "Installation Guide"
[menu.main]
  identifier = "Installation Guide"
  weight = 10
  pre = "<i class='fa fa-puzzle-piece'></i>"
+++

# Installation

The recommended way to get started using the Node.js 2.0 driver is by using `NPM` (Node Package Manager) to install the dependency in your project.

## MongoDB Driver

After you've created your project with ``npm init``, you can install the MongoDB driver and its dependencies with the command:

```
npm install mongodb --save
```

This will download the MongoDB driver and add a dependency entry in your `package.json` file.

## Troubleshooting

The MongoDB driver depends on several other packages, including:

* mongodb-core
* bson
* kerberos
* node-gyp

The only native extension is the `kerberos` extension. This is a `peer dependency` for the `mongodb` module. This means that if you need to use `kerberos` you will need to add the `kerberos` module to your module's dependencies.

If you have **NPM 2.0** or earlier NPM will attempt to download and build the `kerberos` module if you do not have it defined as a dependency in your module. However, from **NPM 3.0** onwards NPM will not attempt to build the `kerberos` module but instead print a warning in your install log that looks something like the following.

```
npm WARN EPEERINVALID mongodb-core@1.2.21 requires a peer of kerberos@~0.0 but none was installed.
```

This tells you that the driver could not resolve its `peer dependency`. However, don't worry. You only need the `kerberos` module if you intend to use `kerberos`, in which case you can add it to your package.json by doing the following:

```
npm install kerberos@0.0.x
```

The `kerberos` package is a C++ extension that requires a build environment to be installed on your system. You must be able to build Node.js itself to be able to compile and install the `kerberos` module. Furthermore the `kerberos` module requires the MIT Kerberos package to correctly compile on UNIX operating systems. Consult your UNIX operating system package manager for what libraries to install.

{{% note class="important" %}}
Windows already contains the SSPI API used for Kerberos authentication. However, you will need to install a full compiler toolchain
using Visual Studio to correctly install the `kerberos` extension.
{{% /note %}}

### Diagnosing on UNIX

If you don’t have the build essentials it won’t build. In the case of linux you will need gcc and g++, Node.js with all the headers and Python. The easiest way to figure out what’s missing is by trying to build the kerberos project. You can do this by performing the following steps.

```
git clone https://github.com/christkv/kerberos.git
cd kerberos
npm install
```

If all the steps complete you have the right toolchain installed. If you get `node-gyp not found` you need to install it globally by doing:

```
npm install -g node-gyp
```

If it compiles correctly, you're ready to proceed. You can now try to install the MongoDB driver with the following command:

```
cd yourproject
npm install mongodb --save
```

If it still fails the next step is to examine the npm log. Re-run the command in verbose mode.

```
npm --loglevel verbose install mongodb
```

This will print out all the steps npm is performing while trying to install the module.

### Diagnosing on Windows

A compiler toolchain known to work for compiling `kerberos` on Windows is the following:

* Visual Studio 2010 (do not use higher versions)
* Windows 7 64bit SDK
* Python 2.7 or higher

Open Visual Studio command prompt. Ensure node.exe is in your path and install node-gyp.

```
npm install -g node-gyp
```

Next you will have to build the project manually to test it. Use any tool you use with git and grab the repo.

```
git clone https://github.com/christkv/kerberos.git
cd kerberos
npm install
node-gyp rebuild
```

This should rebuild the driver successfully if you have everything set up correctly.

### Other possible issues

If Python is installed incorrectly, it can cause problems for `gyp`. It's a good idea to test your 
deployment environment first by trying to build Node.js itself on the server in question, as this should unearth 
any issues with broken packages (and there are a lot of broken packages out there).

Another thing is to ensure your user has write permission to wherever the Node.js modules are being installed.
