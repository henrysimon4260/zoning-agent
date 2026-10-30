import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        paper: "var(--bg)",
        elev: "var(--bg-elev)",
        line: "var(--line)",
        copper: "var(--copper)",
        stamp: "var(--stamp)",
      },
      boxShadow: {
        sheet: "0 24px 60px rgba(40, 28, 16, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
