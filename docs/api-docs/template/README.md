# MongoDB Java Driver Front page

The static front page site for the Java documentation portal.

## Requirements
Hugo version 0.13 [download here](https://github.com/spf13/hugo/releases/tag/v0.13)
<br>
Check out the hugo [quickstart guide](http://gohugo.io/overview/quickstart/).

## Running the server
To run the server call the hugo command:

    hugo server --baseUrl=http://localhost/ --buildDrafts --watch

| Options explained           ||
| --------------------------- |--------------------------------------------------------------------------|
| server                      | Hugo runs its own webserver to render the files                          |
| --baseUrl=http://localhost/ | Normally the base url will be /mongo-java-driver for gh-pages            |
| --buildDrafts               | Include draft posts in the output - these won't be published to gh-pages |
| -- watch                    | Automatically reloads on file change                                     |


All generated content will appear in the `./public` folder, so you can also check the filesystem and browse it locally.<br>
For more hugo server options run: `hugo --help`

### Data

All dynamic / changing data lives in  `./data/mongodb.toml`
