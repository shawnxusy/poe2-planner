import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // PoE-inspired palette: deep stone for surfaces, antique gold for
        // accent, blood red for warnings, ice blue for ES.
        ink: {
          950: "#08070a",
          900: "#0d0c11",
          850: "#13121a",
          800: "#1a1822",
          700: "#27242f",
          600: "#3a3543",
          500: "#5a5263",
        },
        gold: {
          400: "#e6c171",
          500: "#d4a751",
          600: "#a87f36",
        },
        ember: {
          500: "#c84a3a",
          600: "#9d3327",
        },
        frost: {
          400: "#9ad7e8",
          500: "#5fb6cc",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: [
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(212,167,81,0.25), 0 0 32px rgba(212,167,81,0.12)",
      },
      backgroundImage: {
        "vignette":
          "radial-gradient(ellipse at top, rgba(212,167,81,0.06), transparent 60%), radial-gradient(ellipse at bottom, rgba(95,182,204,0.04), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
