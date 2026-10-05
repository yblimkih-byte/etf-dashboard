/* 요약 탭 시안(React + shadcn/ui) — Vite 로 HTML 한 파일로 묶어 web/preview.html 에 복사 → Vercel /preview
   (데이터는 같은 사이트의 /api/data, 현재 화면과 같은 파라미터·캐시 사용) */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), {
    name: 'copy-to-web',
    closeBundle() {
      const src = path.resolve(import.meta.dirname, 'dist/index.html');
      if (fs.existsSync(src)) fs.copyFileSync(src, path.resolve(import.meta.dirname, '../web/preview.html'));
    }
  }],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 }
});
