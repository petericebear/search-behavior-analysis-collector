const TerserPlugin = require('terser-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/tracker.js',
    output: {
      filename: 'tracker.min.js',
      path: path.resolve(__dirname, 'dist'),
      library: {
        name: 'SearchBehaviorAnalysisCollector',
        type: 'umd',
        export: 'default',
      },
      globalObject: 'this',
      clean: true,
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ],
    },
  };
}; 