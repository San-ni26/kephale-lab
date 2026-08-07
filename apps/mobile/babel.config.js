module.exports = function (api) {
  console.log("EXPO_ROUTER_APP_ROOT:", process.env.EXPO_ROUTER_APP_ROOT);
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};
