# Visual Studio Setup

Make use of the following code workspace config to get the ideal setup for working on the driver.
Save the contents below to a file called `node-driver.code-workspace`, somewhere outside the driver folder and modify PATH_TO_DRIVER to point to your local clone.

Launch VSCode and navigate to `File > Open Workspace From File...`.
VScode will automatically recommend a bunch of extensions defined at the bottom of this .code-workspace file.

Here's a quick description of each:

- `streetsidesoftware.code-spell-checker` - Spell check! who doesn't need that 😁.
- `dbaeumer.vscode-eslint` - Runs ESLint automatically after file save, saves you the need to run the linter manually most of the time.
- `hbenl.vscode-test-explorer` - Lets you navigate our tests and run them through button presses.
- `hbenl.vscode-mocha-test-adapter` - The mocha specific module to the common extension mentioned above.
- `github.vscode-pull-request-github` - With this you can manage and make pull requests right from VSCode, even reviews can be done via the editor.
- `eamodio.gitlens` - Gives spectacular insight into git history, has many helpful git navigation UI features.
- `mongodb.mongodb-vscode` - Our VScode extension can be connected to your locally running MongoDB instance (to help debug tests, etc.)

```jsonc
{
    "folders": [
        {
            "name": "node-driver",
            "path": "PATH_TO_DRIVER"
        }
    ],
    "settings": {
        // Automatic Formatting settings
        "editor.codeActionsOnSave": {
            "source.fixAll.eslint": true
        },
        "[json]": {
            "editor.formatOnSave": true
        },
        "[jsonc]": {
            "editor.formatOnSave": true
        },
        "[javascript]": {
            "editor.defaultFormatter": "dbaeumer.vscode-eslint"
        },
        "[typescript]": {
            "editor.defaultFormatter": "dbaeumer.vscode-eslint",
            "editor.codeActionsOnSave": {
                "source.organizeImports": false
            }
        },
        "files.autoSave": "onFocusChange",
        "files.trimTrailingWhitespace": true,
        "files.trimFinalNewlines": true,
        "files.insertFinalNewline": true,
        // Testing settings
        "mochaExplorer.files": "test/unit/**/*.test.*",
        "mochaExplorer.ui": "test/tools/runner/metadata_ui.js",
        "mochaExplorer.envPath": null, // Useful for more advanced tests
        // Typescript settings
        "typescript.disableAutomaticTypeAcquisition": true,
        "typescript.tsdk": "./node_modules/typescript/lib",
        // Editor nice to haves
        "editor.rulers": [
            100
        ],
        "editor.renderWhitespace": "selection"
    },
    "extensions": {
        "recommendations": [
            "streetsidesoftware.code-spell-checker",
            "dbaeumer.vscode-eslint",
            "hbenl.vscode-test-explorer",
            "hbenl.vscode-mocha-test-adapter",
            "github.vscode-pull-request-github",
            "mongodb.mongodb-vscode",
            "eamodio.gitlens"
        ],
        "unwantedRecommendations": [
            "esbenp.prettier-vscode"
        ]
    }
}
```

## Native Extensions

The two non-default things in the configuration are marked with `CHANGE THIS` comments.

- You need to add `node_modules/node-addon-api` to the include path to find `napi.h`.
  - For libmongocrypt the path might be: `bindings/node/node_modules/node-addon-api` depending on your workspace root
- Bump up the cpp standard to whatever the relevant standard is

In VSCode install `ms-vscode.cpptools` and in a `.vscode/c_cpp_properties.json` file add:

```jsonc
{
    "configurations": [
        {
            "name": "Mac",
            "includePath": [
                "${default}",
                "node_modules/node-addon-api" // CHANGE THIS
            ],
            "defines": [],
            "macFrameworkPath": [
                "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/Library/Frameworks"
            ],
            "compilerPath": "/usr/bin/clang",
            "cStandard": "c17",
            "cppStandard": "c++14", // CHANGE THIS
            "intelliSenseMode": "macos-clang-x64"
        }
    ],
    "version": 4
}
```
