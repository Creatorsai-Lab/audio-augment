import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  // Root is the project root so both docs/ and editor/ are reachable
  root: projectRoot,
  base: "/",
  publicDir: path.resolve(projectRoot, "public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(projectRoot, "web-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Landing page — will output to web-dist/docs/index.html
        // A post-build script promotes it to web-dist/index.html
        landing: path.resolve(projectRoot, "docs/index.html"),
        // Studio SPA — will output to web-dist/editor/index.html
        editor: path.resolve(projectRoot, "editor/index.html"),
      },
    },
  },
});
