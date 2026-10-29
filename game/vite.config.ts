import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// As imagens do começo do jogo vão juntas em poucas folhas (tools/atlas.py grava as folhas e
// src/gfx/pack.json). No build o jogo recebe o lugar de cada uma (__BOOT_PACK__) e as soltas que as folhas
// trazem saem da pasta final: a publicação tem limite de arquivos. Uma imagem que mudou depois da folha
// fica solta e carrega sozinha. Em desenvolvimento cada imagem carrega sozinha.
function bootPack(): Plugin {
  let packed: string[] = [];
  let out = '';
  return {
    name: 'boot-pack',
    config(_, { command }) {
      if (command !== 'build') return { define: { __BOOT_PACK__: 'null' } };
      const pack = JSON.parse(readFileSync(resolve(here, 'src/gfx/pack.json'), 'utf8'));
      const images: Record<string, number[]> = {};
      for (const [key, [n, x, y, w, h, sha]] of Object.entries(pack.images as Record<string, [number, number, number, number, number, string]>)) {
        const file = resolve(here, 'public/assets', `${key}.png`);
        if (existsSync(file) && createHash('sha1').update(readFileSync(file)).digest('hex') === sha) images[key] = [n, x, y, w, h];
        else console.warn(`boot-pack: ${key}.png mudou depois da folha e vai solta (rode python3 tools/atlas.py)`);
      }
      packed = Object.keys(images);
      return { define: { __BOOT_PACK__: JSON.stringify({ sheets: pack.sheets, images }) } };
    },
    configResolved(c) {
      out = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      for (const key of packed) rmSync(resolve(out, 'assets', `${key}.png`), { force: true });
    },
  };
}

// base relativo para funcionar no GitHub Pages e depois no Electron
export default defineConfig({
  base: './',
  plugins: [bootPack()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
