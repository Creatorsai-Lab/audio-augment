import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const electronRoot = fileURLToPath(new URL("../electron", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: electronRoot,
  base: "/",
  publicDir: path.resolve(projectRoot, "public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(projectRoot, "web-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(electronRoot, "index.html"),
    },
  },
});
