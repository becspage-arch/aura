import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.tradeaura.app',
  appName: 'Aura',
  webDir: 'out',
  server: {
    url: 'https://tradeaura.net',
    cleartext: false
  }
};

export default config;
