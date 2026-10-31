import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080c",
          900: "#0c0e14",
          850: "#11141c",
          800: "#161a24",
          700: "#20263399",
          600: "#2a3142",
          500: "#3a4358",
          400: "#6b7590",
          300: "#9aa3bb",
          200: "#c9cfdd",
          100: "#eef0f6",
        },
        // Pokémon : jaune électrique / bleu
        poke: { DEFAULT: "#ffcb05", deep: "#3d7dca", glow: "#ffde59" },
        // One Piece : rouge corsaire / or
        op: { DEFAULT: "#e63946", deep: "#9d0208", glow: "#ff6b6b", gold: "#f4b942" },
        up: "#22c55e",
        down: "#ef4444",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0,0,0,.6)",
        glow: "0 0 0 1px rgba(255,255,255,.06), 0 20px 50px -20px rgba(0,0,0,.8)",
      },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
      },
      animation: {
        shimmer: "shimmer 2.2s linear infinite",
        "fade-up": "fade-up .4s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
