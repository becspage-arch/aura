module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  css: ["./src/app/globals.css"],
  output: "./.purged",
  safelist: {
    standard: [/^aura-/, /^gate-/],
  },
};
