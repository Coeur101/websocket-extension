import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import fs from 'fs';

// 清理构建目录插件
function cleanDist() {
  return {
    name: 'clean-dist',
    buildStart() {
      if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true });
      }
    }
  };
}

// 修复manifest中编码的插件
function fixManifestEncoding() {
  return {
    name: 'fix-manifest-encoding',
    writeBundle() {
      const manifestPath = resolve(__dirname, 'dist/manifest.json');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        // 将Unicode编码替换为实际中文字符
        manifest = manifest.replace(/u([0-9a-fA-F]{4})/g, (match, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        });
        fs.writeFileSync(manifestPath, manifest);
      }
    }
  };
}

// 复制静态资源插件
function copyAssets() {
  return {
    name: 'copy-assets',
    writeBundle() {
      // 确保目标目录存在
      if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
      }
      
      // 复制manifest.json
      if (fs.existsSync('public/manifest.json')) {
        fs.copyFileSync('public/manifest.json', 'dist/manifest.json');
      }
      
      // 复制图标文件夹
      if (fs.existsSync('public/icons')) {
        if (!fs.existsSync('dist/icons')) {
          fs.mkdirSync('dist/icons', { recursive: true });
        }
        
        const iconFiles = fs.readdirSync('public/icons');
        iconFiles.forEach(file => {
          fs.copyFileSync(`public/icons/${file}`, `dist/icons/${file}`);
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [
    vue(),
    cleanDist(),
    fixManifestEncoding(),
    copyAssets()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    sourcemap: false,
    minify: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        inject: resolve(__dirname, 'src/inject.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: undefined
      },
      preserveEntrySignatures: 'strict'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  }
}); 
