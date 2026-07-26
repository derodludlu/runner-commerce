// frontend/tailwind.config.ts

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tech & Electronics Theme (Dark Blue/Black)
        tech: {
          primary: "#1C1C1C", // Charcoal Black
          secondary: "#0A1F44", // Deep Navy
          accent: "#007BFF", // Electric Blue
          accentHover: "#0056B3", // Darker Blue
          white: "#FFFFFF",
          gray: "#B0B0B0", // Light Gray
        },
        // Fashion & Lifestyle Theme (White with Accents)
        fashion: {
          primary: "#FFFFFF", // White
          secondary: "#F5F5F5", // Light Gray
          blush: "#FADADD", // Soft Blush
          teal: "#008080", // Teal
          black: "#000000", // Black
          charcoal: "#333333", // Charcoal
          muted: "#777777", // Muted Gray
        },
        // Default (E-commerce Purple)
        indigo: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      container: {
        center: true,
        padding: "1rem",
        screens: {
          sm: "640px",
          md: "768px",
          lg: "1024px",
          xl: "1280px",
        },
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 123, 255, 0.5)",
        "glow-lg": "0 0 30px rgba(0, 123, 255, 0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
