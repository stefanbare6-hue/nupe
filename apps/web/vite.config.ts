import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O build vai para apps/web/dist e é servido pela própria API (NUPE_WEB_DIST).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.NUPE_API ?? "http://localhost:3333",
    },
  },
});
