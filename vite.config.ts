import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    // Force every dependency (including prebundled React Query) to share the
    // exact React runtime used by ReactDOM. Without this, Vite can serve two
    // React module instances after dependency optimization/HMR, which leaves
    // the hooks dispatcher null inside QueryClientProvider.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "@tanstack/react-query"],
  },
}));
