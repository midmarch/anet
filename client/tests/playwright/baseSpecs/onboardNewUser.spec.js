import { expect } from "@playwright/test"
import moment from "moment"
import { TestData } from "../../support/data.js"
import OnboardPage from "../pages/onboard.page.js"
import { currentPage, test, waitFor } from "../support.js"

const REPORT_URL = "/reports/59be259b-30b9-4d04-9e21-e8ceb58cbe9c"
const ONBOARD_USER = {
  familyName: "Bonnsdottir",
  givenName: "Bonny",
  emailAddresses: ["", "bonny@example.com"]
}

let workflow
let identity

test.beforeAll(async ({ api }) => {
  workflow = new TestData(api)
  identity = await workflow.identity("Bonny", {
    firstName: ONBOARD_USER.givenName,
    lastName: workflow.name("Bonnsdottir"),
    email: `${workflow.namespace}-bonny@example.com`
  })
  ONBOARD_USER.familyName = identity.lastName
  ONBOARD_USER.emailAddresses[1] = identity.email
})

test.afterAll(async ({ api, scenario }) => {
  await scenario.reset()
  try {
    if (identity) {
      const { me } = await api.graphql(
        "{me{uuid updatedAt givenName familyName rank gender status pendingVerification user users{uuid domainUsername} country{uuid} emailAddresses{network address}}}",
        {},
        identity
      )
      if (me.uuid) workflow.own("person", me)
    }
  } finally {
    await workflow?.close()
  }
})

// Only required fields in onboarding/edit page
const personDetails = {
  rank: "CIV",
  gender: "FEMALE",
  country: "Albania",
  endOfTourDate: moment().add(1, "days").format("DD-MM-YYYY")
}
test.describe("Onboard new user login", () => {
  test("Should show onboard welcome", async () => {
    await OnboardPage.openAsOnboardUser(REPORT_URL, identity.username)
    const welcomeText = "Welcome to ANET"
    await OnboardPage.waitForWelcomeMessage(welcomeText)
    await expect(await OnboardPage.getWelcomeText()).toHaveText(welcomeText, {
      useInnerText: true
    })
  })
  test("Should click on create your account", async () => {
    await (await OnboardPage.getCreateYourAccountBtn()).scrollIntoViewIfNeeded()
    await (await OnboardPage.getCreateYourAccountBtn()).click()
    // wait for the page transition and rendering of custom fields

    // Check that these are properly copied from the authentication server
    await waitFor(await OnboardPage.getFamilyName(), "visible")
    await expect(await OnboardPage.getFamilyName()).toHaveValue(
      ONBOARD_USER.familyName
    )
    await waitFor(await OnboardPage.getGivenName(), "visible")
    await expect(await OnboardPage.getGivenName()).toHaveValue(
      ONBOARD_USER.givenName
    )
    await waitFor(await OnboardPage.getEmailAddress(0), "visible")
    for (const [index, address] of ONBOARD_USER.emailAddresses.entries()) {
      await expect(await OnboardPage.getEmailAddress(index)).toHaveValue(
        address
      )
    }

    // Check that biography does not exist
    await waitFor(await OnboardPage.getBiography(), "attached", {
      reverse: true
    })
  })
  test("Should not save if endOfTourDate is not in the future", async () => {
    await waitFor(await OnboardPage.getEndOfTourDate(), "visible")
    const yesterday = moment().subtract(1, "days").format("DD-MM-YYYY")
    await OnboardPage.deleteInput(OnboardPage.getEndOfTourDate())
    await (await OnboardPage.getEndOfTourDate()).fill(String(yesterday))
    await (await OnboardPage.getFamilyName()).click()
    const errorMessage = await (
      await OnboardPage.getEndOfTourDate()
    )
      .locator("..")
      .locator("..")
      .locator("..")
      .locator("..")
      .locator("div.invalid-feedback")
      .first()
    await waitFor(errorMessage, "visible")
    await expect(errorMessage).toHaveText(
      "The End of tour date must be in the future",
      {
        useInnerText: true
      }
    )
  })
  test("Should save if all fields properly filled", async () => {
    await (await OnboardPage.getRank()).selectOption(personDetails.rank)
    await (await OnboardPage.getGender()).selectOption(personDetails.gender)
    await (await OnboardPage.getCountryInput()).click()
    await (
      await OnboardPage.getCountryInput()
    ).fill(String(personDetails.country))
    await OnboardPage.waitForCountryAdvancedSelectToChange(
      personDetails.country
    )
    await expect(
      await OnboardPage.getCountryAdvancedSelectFirstItem()
    ).toContainText(personDetails.country, {
      useInnerText: true
    })
    await (await OnboardPage.getCountryAdvancedSelectFirstItem()).click()
    await waitFor(await OnboardPage.getCountryHelpBlock(), "attached", {
      reverse: true
    })
    await OnboardPage.deleteInput(OnboardPage.getEndOfTourDate())
    await (
      await OnboardPage.getEndOfTourDate()
    ).fill(String(personDetails.endOfTourDate))
    await (await OnboardPage.getFamilyName()).click()
    // wait for the error message to disappear
    await OnboardPage.submitForm()
  })
  test("Should be redirected to the original URL", async () => {
    // wait for the page to load
    // We should be redirected to the REPORT_URL
    await currentPage().waitForURL(url => url.pathname === REPORT_URL)
    await OnboardPage.logout()
  })
})
