import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "pink-mist": {
          50: "#faebf0",
          100: "#f4d7e2",
          200: "#e9afc4",
          300: "#de87a7",
          400: "#d35f89",
          500: "#c8376c",
          600: "#a02c56",
          700: "#782141",
          800: "#50162b",
          900: "#280b16",
          950: "#1c080f",
        },
        glaucous: {
          50: "#eaedfa",
          100: "#d6dcf5",
          200: "#adb8eb",
          300: "#8495e1",
          400: "#6A7FDB",
          500: "#324ecd",
          600: "#283fa4",
          700: "#1e2f7b",
          800: "#141f52",
          900: "#0a1029",
          950: "#070b1d",
        },
        "electric-aqua": {
          50: "#e9fbfc",
          100: "#d3f7f8",
          200: "#a7f0f1",
          300: "#7be8ea",
          400: "#4fe1e3",
          500: "#22d9dd",
          600: "#1caeb0",
          700: "#158284",
          800: "#0e5758",
          900: "#072b2c",
          950: "#051e1f",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;





