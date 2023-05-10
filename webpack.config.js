let ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

let path    = require('path');
let webpack = require('webpack');
let isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = {
    context: path.join(__dirname, "src"),
    entry: {"user": "./user.jsx", "user2": "./user2.jsx"},
    mode: isDevelopment ? 'development' : 'production',
    module: {
        rules: [{
            test: /\.jsx?$/,
            exclude: /node_modules/,
            use: [{
                loader: require.resolve('babel-loader'),
                options: {
                    presets: ['@babel/preset-react', '@babel/preset-env'],
                    plugins: [
                        "@babel/plugin-transform-runtime",
                        isDevelopment && require.resolve('react-refresh/babel'),
                    ].filter(Boolean),
                },

            }]
        }]
    },
    devServer: {
        open: true,
        hot: true,
        writeToDisk: true,
        contentBase: "../",
    },
    output: {
        path: __dirname + "/build/",
        filename: "[name].min.js",
    },
    plugins: [
        // ... other plugins
        isDevelopment && new webpack.HotModuleReplacementPlugin(),
        isDevelopment && new ReactRefreshWebpackPlugin(),
    ].filter(Boolean)
};
