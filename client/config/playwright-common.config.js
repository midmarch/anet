export const getCommonConfig = testName => {
  const shard = process.env.PLAYWRIGHT_SHARD?.replace("/", "-of-")
  const phase = process.env.PLAYWRIGHT_PHASE
  const runName = [testName, shard && `shard-${shard}`, phase]
    .filter(Boolean)
    .join("-")
  return {
    workers: Number(
      process.env.PLAYWRIGHT_WORKERS || (process.env.CI ? 5 : 10)
    ),
    retries: 0,
    maxFailures: process.env.CI ? 1 : 0,
    forbidOnly: !!process.env.CI,
    timeout: 180000,
    expect: { timeout: 10000 },
    outputDir: `../build/test-results/${runName}-artifacts`,
    reporter: [
      ["list"],
      [
        "junit",
        { outputFile: `../build/test-results/${runName}-test-results.xml` }
      ],
      ...(shard
        ? [["blob", { outputFile: `../build/blob-reports/${runName}.zip` }]]
        : []),
      ["html", { outputFolder: `../build/${runName}-report`, open: "never" }]
    ],
    use: {
      browserName: "chromium",
      baseURL: process.env.SERVER_URL || "http://localhost:8180",
      viewport: { width: 1600, height: 1200 },
      ignoreHTTPSErrors: true,
      actionTimeout: 10000,
      navigationTimeout: 30000,
      trace: "retain-on-failure",
      screenshot: "only-on-failure"
    }
  }
}
