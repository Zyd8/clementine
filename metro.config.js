// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// whisper.rn ships GGML weights as `.bin`. Metro treats unknown extensions as
// source and tries to parse them, so the model has to be declared an asset —
// this matters if a model is ever bundled rather than downloaded at runtime.
config.resolver.assetExts.push('bin');

module.exports = config;
