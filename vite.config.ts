import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pages and the PDF library are code-split via dynamic imports.
export default defineConfig({
  plugins: [react()],
});
