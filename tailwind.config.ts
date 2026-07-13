import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E0E0E",
        paper: "#FFFFFF",
        line: "#E6E3D4",
        signal: "#0D0D0D",
        lime: "#DFEE7A",
        olive: "#5F7F28",
        cream: "#F4F2EA",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-cormorant)", "Cormorant Garamond", "Georgia", "serif"],
      },
      boxShadow: {
        signal: "0 20px 55px rgba(95, 127, 40, 0.14)",
        soft: "0 10px 30px rgba(13, 13, 13, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
