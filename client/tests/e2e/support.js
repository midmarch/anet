import { test as base, expect } from "@playwright/test"
import { TestApi } from "../support/api.js"
import { Authentication, ScenarioBrowser } from "../support/auth.js"
import { TestData } from "../support/data.js"

export { expect }

export function fail(message) {
  throw new Error(message)
}

export const test = base.extend({
  interactiveAuth: [false, { option: true }],
  authentication: [
    async ({ browser }, provide) => {
      await provide(new Authentication(browser))
    },
    { scope: "worker" }
  ],
  api: [
    // Playwright fixtures require a destructured dependency argument.
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const api = await new TestApi().start()
      try {
        await provide(api)
      } finally {
        await api.close()
      }
    },
    { scope: "worker" }
  ],
  data: async ({ api }, provide) => {
    const data = new TestData(api)
    try {
      await provide(data)
    } finally {
      await data.close()
    }
  },
  app: async (
    { browser, authentication, interactiveAuth, data },
    provide,
    testInfo
  ) => {
    const scenario = new ScenarioBrowser(browser, authentication)
    let page
    const $ = async selector => {
      const locator = page.locator(selector).first()
      await locator.waitFor({ state: "attached" })
      return locator
    }
    const $$ = async selector => {
      const locator = page.locator(selector)
      await locator.first().waitFor({ state: "attached" })
      return locator.all()
    }
    // This dependency closes contexts before their data is archived.
    const app = {
      data,
      get page() {
        return page
      },
      $,
      $$,
      shortWaitMs: 1000,
      mediumWaitMs: 3000,
      async login(pathname, user = "erin") {
        page = await scenario.open(pathname, user, testInfo, interactiveAuth)
        if (interactiveAuth) {
          await page.locator("#username").fill(user)
          await page.locator("#password").fill(user)
          await page.locator("#kc-login").click()
          await expect(page.locator("#kc-form-login")).toBeHidden()
        }
        await app.waitForLoadingFinished()
        await expect(
          page.locator(".not-found-text").filter({
            hasText:
              "There was an error processing this request. Please contact an administrator."
          })
        ).toHaveCount(0)
      },
      async logout() {
        if (!interactiveAuth) {
          await scenario.reset()
          page = undefined
          return
        }
        await page.goto("/api/logout")
        await page.locator("#kc-logout").click()
        await expect(page.locator("#kc-logout")).toBeHidden()
      },
      async waitForLoadingFinished() {
        await expect(page.locator("div.loader")).toHaveCount(0)
      },
      async assertElementText(element, text, message) {
        await expect(element, message).toHaveText(text)
      },
      async assertElementTextIsInt(element, message) {
        await expect(element, message).toHaveText(/^\d+$/)
      },
      async assertElementNotPresent(selector, message, timeout = 9000) {
        await expect(page.locator(selector), message).toHaveCount(0, {
          timeout
        })
      },
      async assertElementEnabled(selector, message, timeout = 9000) {
        await expect(page.locator(selector).first(), message).toBeEnabled({
          timeout
        })
      },
      async assertElementDisabled(selector, message, timeout = 9000) {
        await expect(page.locator(selector).first(), message).toBeDisabled({
          timeout
        })
      }
    }
    app.pageHelpers = {
      async goHomeAndThenToReportsPage() {
        await app.login("/")
        await page.locator("#createButton").click()
      },
      async clickTodayButton() {
        await page.getByRole("button", { name: "Today", exact: true }).click()
      },
      async closeDatePicker(selector) {
        // Close from the date input itself: restoring focus from a calendar or
        // time button would focus the input again and reopen the picker.
        await page.locator(selector).press("Escape")
        // Wait for the closing animation and focus restoration before typing.
        await expect(page.locator(".bp6-datepicker")).toHaveCount(0)
      },
      async chooseAdvancedSelectOption(selector, text, rowNumber = 1) {
        const input = page.getByRole("textbox").and(page.locator(selector))
        await input.click()
        await expect(page.locator(`${selector}-popover`)).toBeVisible()
        // Opening the overlay resets search terms; type only after it is open.
        await Promise.all([
          page.waitForResponse(response => {
            const request = response.request()
            return (
              request.url().endsWith("/graphql") &&
              request.method() === "POST" &&
              request.postDataJSON()?.variables?.query?.text === `${text}*`
            )
          }),
          input.fill(text)
        ])
        await expect(
          page.locator(`${selector}-popover div.loader`)
        ).toHaveCount(0)
        const suggestion = page.locator(
          `${selector}-popover tbody tr:nth-child(${rowNumber}) td:first-child input`
        )
        await suggestion.click()
        return input
      },
      async writeInForm(selector, text) {
        await page.locator(selector).fill(text)
        await page.locator(selector).blur()
        // RichTextEditor flushes pending serialization on blur.
      },
      async assertReportShowStatusText(text) {
        await expect(page.locator(".report-show h4").first()).toHaveText(text)
      },
      async clickMenuLinksButton() {
        await page.locator("#my-work").click()
      },
      async clickMyOrgLink() {
        await page.locator('a[href*="/organizations/"]').first().click()
        await app.waitForLoadingFinished()
      },
      async clickFormBottomSubmit() {
        await page.locator("#formBottomSubmit").click()
      },
      async clickPersonNameFromSupportedPositionsFieldset(personName) {
        const row = page.locator("#supportedPositions table tbody tr").filter({
          has: page
            .locator("td:nth-child(3)")
            .getByText(personName, { exact: true })
        })
        await row.locator("td:nth-child(3) a").click()
        await expect(page).toHaveURL(/\/people\/[0-9a-f-]+/)
      }
    }
    try {
      await provide(app)
    } finally {
      await scenario.captureFailure(testInfo)
      await scenario.close()
    }
  }
})
