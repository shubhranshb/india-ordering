import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@io/core', '@io/providers', '@io/agent'],
  // Workspace sources are ESM TypeScript that import each other with .js specifiers.
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return webpackConfig;
  },
};

export default config;
