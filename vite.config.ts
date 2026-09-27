import devServer from "@hono/vite-dev-server";
import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react(),
  ],
  server: {
    // Local development stays on loopback; use an explicit --host for LAN testing.
    host: "localhost",
    // Honour PORT so two dev servers can run side by side; 3000 stays the
    // default when nothing sets it.
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    // Vite’s default host validation protects the development server from DNS rebinding.
    // Emergent's ingress terminated TLS on 443, so HMR had to be pinned there.
    // Locally that pin breaks the HMR websocket (silent full-page reloads).
    // Set HMR_CLIENT_PORT only when deploying behind such a proxy.
    ...(process.env.HMR_CLIENT_PORT
      ? { hmr: { clientPort: parseInt(process.env.HMR_CLIENT_PORT) } }
      : {}),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      db: path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    // The deferred WebGL field is 515 kB minified (130 kB gzip). Keep the
    // warning immediately above that known lazy boundary so a new oversized
    // critical chunk still fails loudly instead of normalizing a 750 kB limit.
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
