import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const electronRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: electronRoot,
  base: "./",
  publicDir: path.resolve(electronRoot, "..", "public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(electronRoot, "..", "desktop-dist"),
    emptyOutDir: true,
    cssMinify: false,
    rollupOptions: {
      input: path.resolve(electronRoot, "index.html"),
    },
  },
});
