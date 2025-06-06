const TerserPlugin = require('terser-webpack-plugin');
const path = require('path');

module.exports = {
  entry: './src/tracker.js',
  output: {
    filename: 'tracker.min.js',
    path: path.resolve(__dirname, 'dist'),
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
}; 