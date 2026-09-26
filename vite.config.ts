import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist-ui",
    lib: {
      entry: "src/main.tsx",
      name: "BlufinUI",
      formats: ["iife"],
      fileName: () => "blufin-ui.js",
      cssFileName: "blufin-ui",
    },
  },
})
