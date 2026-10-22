import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 两种产物：
 *
 * - `vite build`              → dist/game.js，单文件 ESM，平台加载用
 * - `vite build --mode sheet` → dist-sheet/，画笔刷预览页（不是平台产物）
 * - `vite build --mode zoom`  → dist-zoom/，放大测试页（不是平台产物）
 *
 * SDK 必须内联，不能写 external。包在 blob URL 下执行，裸说明符解析不了，
 * 而 import maps 需要 Chromium 89+，基线是 87。
 */
export default defineConfig(({ mode }) => {
  if (mode === 'sheet') {
    return {
      root: resolve(__dirname, 'tools/sheet'),
      base: './',
      build: {
        outDir: resolve(__dirname, 'dist-sheet'),
        emptyOutDir: true,
        target: 'chrome87',
      },
    };
  }

  if (mode === 'zoom') {
    return {
      root: resolve(__dirname, 'tools/zoom'),
      base: './',
      build: {
        outDir: resolve(__dirname, 'dist-zoom'),
        emptyOutDir: true,
        target: 'chrome87',
      },
    };
  }

  return {
    build: {
      target: 'chrome87',
      lib: {
        entry: resolve(__dirname, 'src/main.ts'),
        formats: ['es'],
        fileName: () => 'game.js',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
      minify: false,
      cssCodeSplit: false,
    },
  };
});
