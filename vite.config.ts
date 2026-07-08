import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
