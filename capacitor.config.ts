// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.tradeaura.app",
  appName: "Aura",
  webDir: "out",
  server: {
    url: "https://tradeaura.net",
    cleartext: false,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: "", // leave blank
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;