import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import * as path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        ref: true,
      },
    }),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      // most specific first — vite/esbuild match in order
      "@/lib": path.resolve(__dirname, "./src/ui/lib"),
      "@chatwar/ui": path.resolve(__dirname, "./src/ui"),
      "@chatwar/shared": path.resolve(__dirname, "./src/shared"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
