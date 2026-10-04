import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.litamerica.hammerlist",
  appName: "HammerList",
  webDir: "dist-github",
  android: {
    allowMixedContent: false,
    backgroundColor: "#f3f4f1"
  }
};

export default config;
