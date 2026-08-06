/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

/**
 * Custom webpack config for NestJS.
 * Bundles ALL node_modules into the output so the deploy artifact
 * is fully self-contained (no external node_modules needed).
 *
 * Only packages that load native .node binaries at runtime are kept
 * external – everything else (stripe, ioredis, axios, etc.) is inlined.
 */
module.exports = (options) => {
  return {
    ...options,
    // Override the default "externals" that NestJS sets via webpack-node-externals.
    // By setting externals to an empty array, webpack bundles every dependency.
    externals: [],
    resolve: {
      ...options.resolve,
      // Ensure webpack can resolve modules from the monorepo root node_modules
      modules: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../../node_modules'),
        'node_modules',
      ],
    },
    // Ignore optional native modules that can't be bundled
    plugins: [
      ...(options.plugins || []),
      new (require('webpack')).IgnorePlugin({
        checkResource(resource) {
          // Ignore optional native packages that aren't needed at runtime
          const nativeOptional = [
            'cpu-features',
            'ssh2',
            '@mongodb-js/zstd',
            'snappy',
            'kerberos',
            '@aws-sdk/credential-provider-sso',
            'mock-aws-s3',
            'aws-sdk',
            'nock',
          ];
          return nativeOptional.some((pkg) => resource === pkg || resource.startsWith(pkg + '/'));
        },
      }),
    ],
  };
};
