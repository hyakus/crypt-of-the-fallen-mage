import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.crypt.fallenmage",
  appName: "Crypt of the Fallen Mage",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
