/* eslint-disable header/header */
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import * as path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const config = {
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
          monacoClassic: path.resolve(__dirname, 'static/monacoClassic.html'),
          monacoExtended: path.resolve(__dirname, 'static/monacoExtended.html'),
        },
      },
    },
    resolve: {
      dedupe: ['vscode'],
    },
    optimizeDeps: {
      esbuildOptions: {
        plugins: [importMetaUrlPlugin],
      },
    },
    server: {
      port: 5173,
    },
  };
  return config;
});
