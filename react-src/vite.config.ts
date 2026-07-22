import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    strictPort: true,
  },
  build: {
    outDir: "build",
    minify: "oxc",
    sourcemap: false,
    cssMinify: true,
  },
});
