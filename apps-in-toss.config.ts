import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'chalsak-race',
  brand: {
    primaryColor: '#44374B',
  },
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'light',
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
  },
  permissions: [],
  webBundleDir: 'dist',
});
