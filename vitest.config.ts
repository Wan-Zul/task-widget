import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // A zone with DST, so tests would catch any accidental local-time math.
    env: { TZ: "Europe/London" },
  },
});
