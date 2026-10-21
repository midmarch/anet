import { expect } from "@playwright/test"

export const serverURL = process.env.SERVER_URL || "http://localhost:8180"
export const keycloakURL =
  process.env.ANET_KEYCLOAK_URL || "http://localhost:9080"
export const realm = process.env.ANET_KEYCLOAK_REALM || "ANET"

// Each worker owns its sessions. Closing a context must not revoke sessions
// reused by another scenario; real logout tests use interactiveAuth instead.
export class Authentication {
  constructor(browser) {
    this.browser = browser
    this.states = new Map()
  }

  cachedStateFor(actor) {
    return this.states.get(typeof actor === "string" ? actor : actor.username)
  }

  async authenticate(page, actor) {
    const { username, password = username } =
      typeof actor === "string" ? { username: actor } : actor
    await page.locator("#username").fill(username)
    await page.locator("#password").fill(password)
    await page.locator("#kc-login").click()
    await expect(page.locator("#topbar")).toBeVisible({ timeout: 30000 })
    const state = await page.context().storageState()
    // Redux and user preferences belong to the workflow, not the auth cache.
    const authentication = {
      storageState: { cookies: state.cookies, origins: [] },
      userLabel: (await page.locator("#bannerUser").innerText()).trim()
    }
    this.states.set(username, authentication)
    return authentication
  }

  async stateFor(actor) {
    if (!this.cachedStateFor(actor)) {
      const context = await this.browser.newContext({
        baseURL: serverURL,
        ignoreHTTPSErrors: true
      })
      try {
        const page = await context.newPage()
        await page.goto("/")
        await this.authenticate(page, actor)
      } finally {
        await context.close()
      }
    }
    return this.cachedStateFor(actor)
  }
}

export class ScenarioBrowser {
  constructor(browser, authentication) {
    this.browser = browser
    this.authentication = authentication
    this.user = undefined
  }

  async open(path, actor, testInfo, interactive = false) {
    const username = typeof actor === "string" ? actor : actor.username
    let needsAuthentication = false
    if (!this.page || this.user !== username) {
      await this.reset()
      const use = testInfo.project.use
      const authentication = interactive
        ? undefined
        : this.authentication.cachedStateFor(actor)
      this.context = await this.browser.newContext({
        baseURL: use.baseURL,
        viewport: use.viewport,
        ignoreHTTPSErrors: use.ignoreHTTPSErrors,
        ...(authentication ? { storageState: authentication.storageState } : {})
      })
      this.context.setDefaultTimeout(use.actionTimeout)
      this.context.setDefaultNavigationTimeout(use.navigationTimeout)
      this.page = await this.context.newPage()
      this.user = username
      needsAuthentication = !interactive && !authentication
    }
    await this.page.goto(path)
    if (needsAuthentication)
      await this.authentication.authenticate(this.page, actor)
    if (!interactive) {
      // A restored session must reach the application, never silently fall back
      // to typing credentials or running assertions as the wrong user.
      const loginForm = this.page.locator("#kc-form-login")
      await expect(
        this.page.locator("#topbar").or(loginForm),
        `Authenticated application for ${username}`
      ).toBeVisible({ timeout: 30000 })
      if (await loginForm.isVisible())
        throw new Error(
          `Restored authentication for ${username} returned to the login form`
        )
      const state = await this.authentication.stateFor(actor)
      await expect(this.page.locator("#bannerUser")).toContainText(
        state.userLabel
      )
    }
    return this.page
  }

  async captureFailure(testInfo) {
    if (testInfo.status === testInfo.expectedStatus) return
    if (this.page && !this.page.isClosed()) {
      const path = testInfo.outputPath("scenario-failure.png")
      await this.page
        .screenshot({ path })
        .then(() =>
          testInfo.attach("screenshot", { path, contentType: "image/png" })
        )
        .catch(() => {})
    }
  }

  async reset() {
    await this.context?.close()
    this.context = undefined
    this.page = undefined
    this.user = undefined
  }

  async close() {
    await this.reset()
  }
}
