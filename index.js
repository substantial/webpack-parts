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
 *                                     options](https://github.com/postcss/postcss-loader#options)
 * @param {string} [$0.extractFilename] Path to extract css to using
 *                                      `extract-text-webpack-plugin` when
 *                                      `NODE_ENV=production`
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
 * @param {string} [$0.basePath] The base path to which js files will be
 *                               emitted. It's essentially a prefix to
 *                               `fileName` and `chunkFilename`
 */
const js = ({ include, basePath = '' } = {}) => ({
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
 *                               emitted.
 * @param {number} [$0.inlineLimitBytes] If set, inline images that are smaller
 *                                       than $0.inlineLimitBytes when `NODE_ENV
 *                                       === 'production'`
 */
const images = (
  { include, imageOptions, basePath = '', inlineLimitBytes } = {}
) => ({
  module: {
    rules: [
      {
        include,
        test: /\.(png|jpg|gif|svg)$/,
        use: ifProd(
          [
            inlineLimitBytes
              ? {
                  loader: 'url-loader',
                  options: {
                    inlineLimitBytes,
                    name: `${basePath}[name].[hash:8].[ext]`,
                  },
                }
              : {
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

/**
 * Do not include any of moment's locales. If we don't do this, they are all
 * included and add 23kb min+gzip. You probably shouldn't use this if you need
 * to support other locales.
 *
 * @function optimize.removeMomentLocales
 */
const removeMomentLocales = () => ({
  plugins: [
    new webpack.ContextReplacementPlugin(/moment[\\/]locale$/, /^no-locales$/),
  ],
})

/**
 * Force to a single version of lodash across all dependencies. Lodash is big
 * and we don't want to include it or its bits more than once. This is probably
 * safe as long as there are no mixed major versions and the most recent version
 * of lodash is the one forced.
 *
 * @function optimize.forceSingleLodash
 * @param {string} lodashPath Absolute path to lodash module
 * @example
 * parts.optimize.forceSingleLodash(require.resolve('lodash'))
 */
const forceSingleLodash = lodashPath => ({
  resolve: {
    alias: {
      lodash: lodashPath,
      'lodash-es': lodashPath,
    },
  },
})

/**
 * Extract all used dependencies from `node_modules` into a separate `vendor.js`.
 * By default, it will consider all dependencies used by all entry points, but
 * you override this by specifying `$0.chunks`.
 *
 * @function vendorNodeModules
 * @param {string} [$0.name] Name of vendor chunk
 * @param {Array<string>} [$0.chunks] Array of entry chunk names to consider
 *                                    when looking for used `node_modules`.
 */
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

/**
 * Make environment variables available via `process.env` while building. The
 * variables are copied from the current environment at build time. If you want
 * to set environment variables to something other to what they actually are in
 * the current environment, use `setEnv`. Makes use of
 * `webpack.EnvironmentPlugin`.
 *
 * @function copyEnv
 * @param {Array<string>} vars The names of environment variables to make available.
 */
const copyEnv = vars => ({
  plugins: [new webpack.EnvironmentPlugin(vars)],
})

/**
 * Make environment variables available via `process.env` while building. The
 * variables are set explicitly as specified in `env`. Note that you should not
 * `JSON.stringify` the values, that will be done for you. Makes use of
 * `webpack.DefinePlugin`
 *
 * @function setEnv
 * @param {Object} env An object whose keys are the names of environment
 *                     variables and whose values are the values to set. These
 *                     should be plain JSON objects.
 */
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

/**
 * Enable hot module reloading when `NODE_ENV !== 'production'`
 *
 * @function dev.hotModuleReloading
 * @param {boolean} [$0.useReactHotLoader] Set to true if you're using
 *                  `react-hot-loader`. Adds `react-hot-loader-patch` to each
 *                  entry.
 * @param {boolean} [$0.useWebpackHotMiddleware] Set to true if you're using
 *                  `webpack-hot-middleware`. Adds
 *                  `webpack-hot-middleware/client` to each entry.
 * @param {boolean} [$0.webpackDevServerUrl] Set to url such as
 *                  `http://localhost:3000` if you're using
 *                  `webpack-dev-server`. Adds `webpack-dev-server/client` and
 *                  `webpack/hot/only-dev-server` to each entry. Should not be
 *                  used with `useWebpackHotMiddleware`.
 */
const hotModuleReloading = (
  {
    useReactHotLoader,
    useWebpackHotMiddleware,
    webpackDevServerUrl,
  } = {}
) => ifProd(
  null,
  flow(
    failIfNotConfigured('entry', 'hotModuleReloading'),
    useWebpackHotMiddleware &&
      prependToEachEntry('webpack-hot-middleware/client'),
    webpackDevServerUrl && prependToEachEntry('webpack/hot/only-dev-server'),
    webpackDevServerUrl &&
      prependToEachEntry(`webpack-dev-server/client?${webpackDevServerUrl}`),
    useReactHotLoader && prependToEachEntry('react-hot-loader-patch'),
    merge({
      plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
      ],
    })
  )
)

/**
 * Use `webpack-bundle-analyzer` to analyze bundle size. Opens a web browser
 * with a visual graph of bundled modules and their sizes
 *
 * @function dev.analyze
 */
const analyze = () => ({
  plugins: [
    new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
      analyzerMode: 'static',
    }),
  ],
})

/**
 * Minimize javascript code using uglify and configure all other loaders to
 * minimize and disable debug if `NODE_ENV === 'production'`.
 *
 * @function optimize.minimize
 */
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

/**
 * Enable source maps. Uses different options depending on NODE_ENV.
 *
 * @function dev.sourceMaps
 * @param {string} $0.development devtool to use in development. Defaults to
 *                                `cheap-module-source-map`
 * @param {string} $0.production devtool to use in production. Defaults to
 *                               `source-map`
 */
const sourceMaps = (
  {
    development = 'cheap-module-source-map',
    production = 'source-map',
  } = {}
) => ({ devtool: ifProd(production, development) })

/**
 * Enable progress bar when building at the command line.
 *
 * @function ui.progressBar
 */
const progressBar = () => ({
  plugins: [new (require('progress-bar-webpack-plugin'))()],
})

module.exports = {
  combine,
  copyEnv,
  css,
  images,
  js,
  setEnv,
  vendorNodeModules,
  dev: {
    hotModuleReloading,
    sourceMaps,
    analyze,
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
