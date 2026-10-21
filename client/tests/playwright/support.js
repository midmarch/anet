import { test as base, expect } from "@playwright/test"
import { TestApi } from "../support/api.js"
import { Authentication, ScenarioBrowser } from "../support/auth.js"
import { TestData } from "../support/data.js"

let activeScenario
let activeInfo
let interactive
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
  scenario: [
    async ({ browser, authentication }, provide) => {
      const scenario = new ScenarioBrowser(browser, authentication)
      try {
        await provide(scenario)
      } finally {
        await scenario.close()
      }
    },
    { scope: "worker" }
  ],
  bindPage: [
    async ({ scenario, interactiveAuth }, provide, testInfo) => {
      if (scenario.file !== testInfo.file) {
        await scenario.close()
        scenario.file = testInfo.file
      }
      activeScenario = scenario
      activeInfo = testInfo
      interactive = interactiveAuth
      try {
        await provide()
      } finally {
        await scenario.captureFailure(testInfo)
        activeScenario = undefined
      }
    },
    { auto: true }
  ]
})

export function currentPage() {
  if (!activeScenario?.page)
    throw new Error("Open a page inside a Playwright scenario first")
  return activeScenario.page
}

export async function openAs(path, actor = activeScenario.user || "erin") {
  return activeScenario.open(path, actor, activeInfo, interactive)
}

export async function endSession() {
  if (interactive) return false
  await activeScenario.reset()
  return true
}

export async function waitFor(locator, state, options = {}) {
  const { reverse = false, timeout = 10000 } = options
  if (state === "clickable") {
    await expect(locator).toBeVisible({ timeout })
    await expect(locator).toBeEnabled({ timeout })
    return
  }
  await locator.waitFor({
    state: reverse ? (state === "attached" ? "detached" : "hidden") : state,
    timeout
  })
}

export async function waitUntil(callback, options = {}) {
  await expect
    .poll(callback, {
      timeout: options.timeout || 10000,
      message: options.timeoutMsg
    })
    .toBeTruthy()
}

export async function isClickable(locator) {
  try {
    await locator.click({ trial: true, timeout: 1000 })
    return true
  } catch {
    return false
  }
}

export async function typeKeys(value) {
  const keyboard = currentPage().keyboard
  if (Array.isArray(value)) {
    for (const key of value) {
      await keyboard.press(key)
    }
  } else {
    await keyboard.insertText(String(value))
    const focused = currentPage().locator(":focus")
    if ((await focused.getAttribute("contenteditable")) === "true") {
      await focused.blur()
    }
  }
}

export async function mapSequential(items, callback) {
  const results = []
  for (let index = 0; index < items.length; index++) {
    results.push(await callback(items[index], index))
  }
  return results
}
