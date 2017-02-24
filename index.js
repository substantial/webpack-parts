const webpack = require('webpack')
const webpackMerge = require('webpack-merge')
const { mapValues } = require('lodash')

const ifProd = (prod, notProd) =>
  process.env.NODE_ENV === 'production' ? prod : notProd

const baseConfig = () => ({
  output: {
    filename: `[name]${ifProd('.[chunkhash]', '')}.js`,
    chunkFilename: `[name]${ifProd('.[chunkhash]', '')}.js`,
    publicPath: '/',
  },
})

const merge = (...mergees) => a => webpackMerge(a, ...mergees.filter(x => x))
const dumbMerge = b => a => Object.assign({}, a, b)

/**
 * Combine multiple webpack parts into a webpack config. A part is either an
 * object, which will be merged in to the config, or it is a function that takes
 * the config as it is and is expected to return a new version of the config.
 * The parts are resolved in the order they are provided. There is a small base
 * config that combine starts with that looks like this:
 *
 * ```js
 * {
 *   output: {
 *     filename: '[name].[chunkhash].js',
 *     chunkFilename: '[name].[chunkhash].js',
 *     publicPath: '/'
 *   }
 * }
 * ```
 *
 * @function combine
 * @param {Array<Object|Function>} parts Array of webpack config objects or functions
 * @returns {Object} Combined Webpack config object
 * @example
 * // webpack.config.js
 * const parts = require('webpack-parts')
 *
 * module.exports = parts.combine(
 *   {
 *     entry: "app/index.js",
 *     output: {
 *       path: "build"
 *     }
 *   },
 *   parts.js(),
 *   parts.css(),
 *   parts.dev.sourceMaps(),
 *   parts.optimize.minimize()
 * )
 */
const combine = parts =>
  parts
    .filter(x => x)
    .reduce(
      (config, part) =>
        typeof part === 'function' ? part(config) : webpackMerge(config, part),
      baseConfig()
    )

const flow = (...fs) => x => fs.filter(x => x).reduce((acc, f) => f(acc), x)

const inlineCss = ({ include, postcssOptions }) => ({
  module: {
    rules: [
      {
        include,
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: postcssOptions,
            },
          },
        ],
      },
    ],
  },
})

/**
 * Use postcss to process css.
 *
 * @function css
 * @param {string|Array} [$0.include] [Webpack include
 * conditions](https://webpack.js.org/configuration/module/#condition)
 * @param {Object} [$0.postcssOptions] [postcss-loader
 * options](https://github.com/postcss/postcss-loader#options)
 * @param {string} [$0.extractFilename] Path to extract css to using
 * `extract-text-webpack-plugin` when `NODE_ENV=production`
 */
const css = ({ include, postcssOptions, extractFilename } = {}) => ifProd(
  config => {
    if (!extractFilename)
      return merge(inlineCss({ include, postcssOptions }))(config)

    const ExtractTextWebpackPlugin = require('extract-text-webpack-plugin')
    const extractPlugin = new ExtractTextWebpackPlugin(extractFilename)

    return merge({
      module: {
        rules: [
          {
            include,
            test: /\.css$/,
            use: extractPlugin.extract({
              fallback: 'style-loader',
              use: [
                {
                  loader: 'css-loader',
                  options: {
                    importLoaders: 1,
                  },
                },
                {
                  loader: 'postcss-loader',
                  options: postcssOptions,
                },
              ],
            }),
          },
        ],
      },
      plugins: [extractPlugin],
    })(config)
  },
  inlineCss({ include, postcssOptions })
)

/**
 * Use babel to process js.
 *
 * @function js
 * @param {string|Array} [$0.include] [Webpack include
 * conditions](https://webpack.js.org/configuration/module/#condition)
 * @param {string} [$0.basePath] The base path to which js files will be emitted.
 *        It's essentially a prefix to `fileName` and `chunkFilename`
 */
const js = ({ include, basePath = '' }) => ({
  output: {
    filename: `${basePath}[name]${ifProd('.[chunkhash]', '')}.js`,
    chunkFilename: `${basePath}[name]${ifProd('.[chunkhash]', '')}.js`,
    publicPath: '/',
  },
  module: {
    rules: [
      {
        include,
        test: /\.jsx?$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
})

/**
 * Include images via urls.
 *
 * @function images
 * @param {string|Array} [$0.include] [Webpack include
 * conditions](https://webpack.js.org/configuration/module/#condition)
 * @param {Object} [$0.imageOptions] Options to pass to `image-webpack-loader`
 * @param {string} [$0.basePath] The base path to which images files will be
 *        emitted.
 */
const images = ({ include, imageOptions, basePath = '' } = {}) => ({
  module: {
    rules: [
      {
        include,
        test: /\.(png|jpg|gif|svg)$/,
        use: ifProd(
          [
            {
              loader: 'file-loader',
              options: {
                name: `${basePath}[name].[hash:8].[ext]`,
              },
            },
            {
              loader: 'image-webpack-loader',
              options: imageOptions,
            },
          ],
          [
            {
              loader: 'file-loader',
              options: {
                name: `${basePath}[name].[ext]`,
              },
            },
          ]
        ),
      },
    ],
  },
})

const inlineImages = (
  {
    basePath = '',
    imageOptions,
    include,
    limit = 10000,
  } = {}
) => ({
  module: {
    rules: [
      {
        include,
        test: /\.(png|jpg|gif|svg)$/,
        use: ifProd(
          [
            {
              loader: 'url-loader',
              options: {
                limit,
                name: `${basePath}[name].[hash:8].[ext]`,
              },
            },
            {
              loader: 'image-webpack-loader',
              options: imageOptions,
            },
          ],
          {
            loader: 'file-loader',
            options: {
              name: `${basePath}[name].[ext]`,
            },
          }
        ),
      },
    ],
  },
})

// Do not include any of moment's locales. If we don't do this, they are all
// included and add 23kb min+gzip. You probably shouldn't use this if you need
// to support other locales
const removeMomentLocales = () => ({
  plugins: [
    new webpack.ContextReplacementPlugin(/moment[\\/]locale$/, /^no-locales$/),
  ],
})

// Force to a single version of lodash across all dependencies. Lodash is big
// and we don't want to include it or its bits more than once
const forceSingleLodash = lodashPath => ({
  resolve: {
    alias: {
      lodash: lodashPath,
      'lodash-es': lodashPath,
    },
  },
})

const vendorNodeModules = ({ name = 'vendor', chunks }) => ({
  plugins: [
    new webpack.optimize.CommonsChunkPlugin({
      minChunks(module) {
        return module.context && module.context.indexOf('node_modules') !== -1
      },
      names: [name],
      chunks,
    }),
  ],
})

const copyEnv = vars => ({
  plugins: [new webpack.EnvironmentPlugin(vars)],
})

const setEnv = env => ({
  plugins: [
    new webpack.DefinePlugin({
      'process.env': mapValues(env, value => JSON.stringify(value)),
    }),
  ],
})

const prependToEntry = (entry, file) => {
  if (typeof entry === 'string') return [file, entry]
  if (Array.isArray(entry)) return [file, ...entry]

  return mapValues(entry, subEntry => prependToEntry(subEntry, file))
}

const prependToEachEntry = file => config => dumbMerge({
  entry: prependToEntry(config.entry, file),
})(config)

const failIfNotConfigured = (field, name) => config => {
  if (!config[field]) {
    throw new Error(
      `Please ensure that "${field}" is set before using ${name}`
    )
  }
  return config
}

const reactHotLoader = () => ifProd(
  null,
  flow(
    failIfNotConfigured('entry', 'reactHotLoader'),
    prependToEachEntry('react-hot-loader/patch'),
    merge({
      plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
      ],
    })
  )
)

const analyze = () => ({
  plugins: [
    new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
      analyzerMode: 'static',
    }),
  ],
})

const webpackHotMiddleware = () =>
  ifProd(
    null,
    flow(
      failIfNotConfigured('entry', 'webpackHotMiddleware'),
      prependToEachEntry('webpack-hot-middleware/client')
    )
  )

const minimize = () => ifProd({
  plugins: [
    new webpack.LoaderOptionsPlugin({
      minimize: true,
      debug: false,
    }),
    new webpack.optimize.UglifyJsPlugin({
      compress: {
        screw_ie8: true, // React doesn't support IE8
        warnings: false,
      },
      mangle: {
        screw_ie8: true,
      },
      output: {
        comments: false,
        screw_ie8: true,
      },
      sourceMap: true,
    }),
  ],
})

const sourceMaps = (
  {
    development = 'cheap-module-source-map',
    production = 'source-map',
  } = {}
) => ({ devtool: ifProd(production, development) })

const progressBar = () => ({
  plugins: [new (require('progress-bar-webpack-plugin'))()],
})

module.exports = {
  analyze,
  combine,
  copyEnv,
  css,
  images,
  inlineImages,
  js,
  setEnv,
  vendorNodeModules,
  dev: {
    reactHotLoader,
    sourceMaps,
    webpackHotMiddleware,
  },
  optimize: {
    forceSingleLodash,
    minimize,
    removeMomentLocales,
  },
  ui: {
    progressBar,
  },
  util: {
    ifProd,
    merge,
  },
}
