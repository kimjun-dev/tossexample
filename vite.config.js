import { resolve } from 'node:path';

export default {
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve('index.html'),
        game: resolve('code/index.html')
      }
    }
  }
};
