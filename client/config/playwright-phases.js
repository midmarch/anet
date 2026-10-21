// These cases assert the exact seed, aggregate counts, or change global/user
// settings. Run once, with one worker, before resetting for the sharded phase.
export const seedContracts = [
  "baseSpecs/homeTiles.spec.js",
  "baseSpecs/myReports.spec.js",
  "baseSpecs/reportsAggregatedOverTime.spec.js",
  "baseSpecs/searchFilters/locationFilter.spec.js",
  "baseSpecs/searchFilters/taskFilter.spec.js"
]

export function phaseConfig() {
  const phase = process.env.PLAYWRIGHT_PHASE
  if (!phase) return {}
  if (!["contracts", "scenarios"].includes(phase))
    throw new Error(`Unknown Playwright phase: ${phase}`)
  const patterns = seedContracts.map(file => `**/${file}`)
  return phase === "contracts"
    ? { testMatch: patterns, workers: 1 }
    : { testIgnore: patterns }
}
