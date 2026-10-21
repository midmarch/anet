import { defineConfig } from "@playwright/test"
import { getCommonConfig } from "./playwright-common.config.js"

const common = getCommonConfig("playwright-fixtures")

export default defineConfig({
  ...common,
  reporter: common.reporter.filter(([name]) => name !== "blob"),
  testDir: "../tests/support",
  testMatch: "infrastructure.spec.js",
  workers: 1
})
