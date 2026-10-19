import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["./client", "./shared", "index.html"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
    // Transpile down to an older Safari/WebKit baseline. Vite's modern default
    // leaves syntax that older iPhones can't parse, which fails the whole bundle
    // and shows as a blank white page on iOS only.
    target: ["es2019", "safari13"],
    cssTarget: "safari13",
  },
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
