const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withSplitApk(config) {
  return withAppBuildGradle(config, async (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /android\s*\{/,
      `android {\n    splits {\n        abi {\n            reset()\n            enable true\n            universalApk true\n            include "armeabi-v7a", "arm64-v8a"\n        }\n    }`
    );
    return config;
  });
};
