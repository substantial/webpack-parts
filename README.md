# webpack-parts

Build your webpack config from composable and opinionated parts.

## Installation

```bash
$ yarn add --dev webpack-parts
```

## Usage

Combine multiple webpack parts into a webpack config. A part is either an
object, which will be merged in to the config, or it is a function that takes
the config as it is and is expected to return a new version of the config. The
parts are resolved in the order they are provided. There is a small base config
that combine starts with that looks like this in production (chunkhash will be
omitted if `NODE_ENV !== 'production'`):

```js
{
  output: {
    filename: '[name].[chunkhash].js',
    chunkFilename: '[name].[chunkhash].js',
    publicPath: '/'
  }
}
```

Read the [documentation](https://substantial.github.io/webpack-parts/) to see
the various parts that can be used.

### Example

```js
// webpack.config.js
const parts = require('webpack-parts')

module.exports = parts.combine(
  {
    entry: "app/index.js",
    output: {
      path: "build"
    }
  },
  parts.load.js(),
  parts.load.css(),
  parts.dev.sourceMaps(),
  parts.optimize.minimize()
)
```
