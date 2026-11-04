// Proxy do Vercel dev: a interface compilada fica em apps/web/dist e a API
// (uma pasta acima só, /api) responde no mesmo endereço.
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/web/dist",
  server: { port: 3000 },
  preview: { port: 3000 },
  build: { outDir: "." },
});
