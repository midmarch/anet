import { expect } from "@playwright/test"
import LocationFilter from "../../pages/searchFilters/locationFilter.page.js"
import { test } from "../../support.js"

test.describe("When using the location filter on the reports search", () => {
  test("Should show all the locations", async () => {
    await LocationFilter.open()
    await LocationFilter.openLocationFilter()
    await LocationFilter.openLocationPopover()

    // Exact counts in the fresh-seed phase; standalone runs can also include
    // locations created by the dedicated creation and editing workflows.
    const rows = await LocationFilter.getLocationRows()
    if (process.env.PLAYWRIGHT_PHASE === "contracts") {
      await expect(rows).toHaveCount(253)
    } else {
      await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(253)
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(260)
    }
    await LocationFilter.openAllCollapsedLocations()
    if (process.env.PLAYWRIGHT_PHASE === "contracts") {
      await expect(rows).toHaveCount(285)
    } else {
      await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(285)
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(291)
    }
  })
  test("Should show only the filtered locations", async () => {
    await LocationFilter.searchLocations("Mart")
    await expect(await LocationFilter.getLocationRows()).toHaveCount(2)
    // the locations should already load expanded, so it should yield the same result
    await LocationFilter.openAllCollapsedLocations()
    await expect(await LocationFilter.getLocationRows()).toHaveCount(4)
    await LocationFilter.closeLocationFilter()
    await LocationFilter.searchLocations("Afghanistan")
    await expect(await LocationFilter.getLocationRows()).toHaveCount(1)
    // the only location should now expand, leading to a bigger location count
    await LocationFilter.openAllCollapsedLocations()
    await expect(await LocationFilter.getLocationRows()).toHaveCount(19)
    await LocationFilter.closeLocationFilter()
  })
})
