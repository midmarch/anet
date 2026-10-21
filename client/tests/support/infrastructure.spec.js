import { expect, test } from "../e2e/support.js"
import { keycloakURL, realm, ScenarioBrowser } from "./auth.js"
import { TestData } from "./data.js"

test("cached authentication preserves identities and isolates browser storage", async ({
  browser,
  authentication
}, testInfo) => {
  const first = new ScenarioBrowser(browser, authentication)
  const second = new ScenarioBrowser(browser, authentication)
  try {
    await first.open("/", "arthur", testInfo)
    const cached = authentication.cachedStateFor("arthur")
    expect(cached).toBeDefined()
    await first.page.evaluate(() =>
      localStorage.setItem("fixture-isolation", "private")
    )
    await first.reset()
    await second.open("/", "arthur", testInfo)
    expect(
      await second.page.evaluate(() =>
        localStorage.getItem("fixture-isolation")
      )
    ).toBeNull()
    expect(await authentication.stateFor("arthur")).toBe(cached)
    await second.open("/", "rebecca", testInfo)
    await expect(second.page.locator("#bannerUser")).toContainText(
      "Rebecca Beccabon"
    )
    expect(cached.storageState.origins).toEqual([])
  } finally {
    await first.close()
    await second.close()
  }
})

test("invalid restored sessions fail without typing credentials", async ({
  browser,
  authentication
}, testInfo) => {
  const cached = await authentication.stateFor("arthur")
  authentication.states.set("arthur", {
    ...cached,
    storageState: { cookies: [], origins: [] }
  })
  const scenario = new ScenarioBrowser(browser, authentication)
  try {
    await expect(scenario.open("/", "arthur", testInfo)).rejects.toThrow(
      "returned to the login form"
    )
    await expect(scenario.page.locator("#username")).toHaveValue("")
    await expect(scenario.page.locator("#password")).toHaveValue("")
  } finally {
    authentication.states.set("arthur", cached)
    await scenario.close()
  }
})

for (const failSetup of [false, true]) {
  test(`owned data and identities are cleaned after ${failSetup ? "failed" : "successful"} setup`, async ({
    api
  }) => {
    const data = new TestData(api)
    let actor
    let report
    let identity
    try {
      const organization = await data.organization("Cleanup")
      actor = await data.actor("Cleanup", organization, {
        type: "SUPERUSER",
        administrates: [organization]
      })
      identity = data.identities[0]
      const { me } = await api.graphql(
        "{me{uuid position{organizationsAdministrated{uuid}}}}",
        {},
        actor
      )
      expect(me.uuid).toBe(actor.person.uuid)
      expect(
        me.position.organizationsAdministrated.map(org => org.uuid)
      ).toEqual([organization.uuid])
      // Include an empty position: teardown must not try to remove a null occupant.
      await data.position("Unfilled cleanup", organization)
      report = await data.report("Cleanup")
      if (failSetup) throw new Error("Simulated fixture setup failure")
    } catch (error) {
      if (!failSetup || error.message !== "Simulated fixture setup failure")
        throw error
    } finally {
      await data.close()
    }
    expect(
      (
        await api.graphql("query($uuid:String!){person(uuid:$uuid){status}}", {
          uuid: actor.person.uuid
        })
      ).person.status
    ).toBe("INACTIVE")
    expect(
      (
        await api.graphql(
          "query($uuid:String!){position(uuid:$uuid){status person{uuid}}}",
          { uuid: actor.position.uuid }
        )
      ).position
    ).toEqual({ status: "INACTIVE", person: null })
    const response = await api.request.get(
      `${keycloakURL}/admin/realms/${realm}/users/${identity}`,
      { headers: { Authorization: `Bearer ${await data.adminToken()}` } }
    )
    expect(response.status()).toBe(404)
    await expect(
      api.graphql("query($uuid:String!){report(uuid:$uuid){uuid}}", {
        uuid: report.uuid
      })
    ).rejects.toMatchObject({ status: 404 })
    await data.close()
  })
}

test("API authentication and GraphQL errors fail explicitly", async ({
  api
}) => {
  await expect(
    api.token("nonexistent-playwright-fixture-user")
  ).rejects.toThrow("Authentication failed")
  await expect(api.graphql("{fieldThatDoesNotExist}")).rejects.toThrow(
    "Fixture GraphQL request failed"
  )
})
