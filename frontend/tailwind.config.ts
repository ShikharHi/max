import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: "#0a0a0f",
          surface: "#111118",
          elevated: "#16161f",
          border: "#1e1e2e",
          cyan: "#00d4ff",
          violet: "#7c3aed",
          text: "#e8e8f0",
          secondary: "#6b6b80",
          muted: "#3d3d52",
          success: "#10b981",
          error: "#ef4444",
          warning: "#f59e0b"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"]
      },
      boxShadow: {
        glow: "0 0 24px rgba(0, 212, 255, 0.18)",
        focus: "0 0 0 3px rgba(0, 212, 255, 0.12)"
      },
      keyframes: {
        cursor: {
          "0%, 45%": { opacity: "1" },
          "46%, 100%": { opacity: "0" }
        }
      },
      animation: {
        cursor: "cursor 1s step-end infinite"
      }
    }
  },
  plugins: [typography]
};

export default config;
