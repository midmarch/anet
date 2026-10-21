import { v4 as uuidv4 } from "uuid"
import { test as base, expect, fail } from "./support.js"

// Every capability owns its identities and graph; cases may run in any worker.
const test = base.extend({
  graph: async ({ data }, provide) => {
    const organization = await data.organization("Permissions")
    const outside = await data.organization("Outside permissions")
    await provide({
      organization,
      outside,
      actor: (name, options) => data.actor(name, organization, options)
    })
  }
})

for (const type of ["SUPERUSER", "ADMINISTRATOR"]) {
  test(`${type}: person creation controls`, async ({ app, graph }) => {
    const actor = await graph.actor("Creator", {
      type,
      administrates: [graph.organization]
    })
    await app.login("/", actor)
    await (await app.$("#createButton")).click()
    await (await app.$("#new-person")).click()
    await expect(app.page.locator('[name="familyName"]')).toBeVisible()
    if (type === "ADMINISTRATOR") {
      await expect(app.page.locator("#fg-user")).toBeVisible()
      await app.page.locator('label[for="user_true"]').click()
      await expect(app.page.locator("#addusersButton")).toBeVisible()
    } else {
      await expect(app.page.locator("#fg-user")).toHaveCount(0)
    }
  })
}

for (const type of ["REGULAR", "SUPERUSER", "ADMINISTRATOR"]) {
  test(`${type}: edit own biography and position permissions`, async ({
    app,
    graph
  }) => {
    const actor = await graph.actor("Self", {
      type,
      administrates: [graph.organization]
    })
    await app.login(`/people/${actor.person.uuid}`, actor)
    await validateUserCanEditUserForCurrentPage(app, type !== "REGULAR")
    const biography = app.page.locator(".biography .editable")
    const saved = await biography.innerText()
    await app.page.reload()
    await expect(biography).toHaveText(saved)
    if (type === "REGULAR") {
      await app.page.locator(".position-name").click()
      await expect(
        app.page.locator(".legend .title-text").first()
      ).toContainText(actor.position.name)
      await expect(app.page.locator(".edit-position")).toHaveCount(0)
    } else {
      await editAndSavePositionFromCurrentUserPage(app, true)
    }
  })
}

for (const [type, targetType, sameOrganization, canEdit] of [
  ["SUPERUSER", "SUPERUSER", true, true],
  ["SUPERUSER", "ADMINISTRATOR", false, false],
  ["SUPERUSER", "SUPERUSER", false, false],
  ["REGULAR", "SUPERUSER", true, false],
  ["REGULAR", "ADMINISTRATOR", true, false],
  ["ADMINISTRATOR", "SUPERUSER", true, true]
]) {
  test(`${type}: ${canEdit ? "can" : "cannot"} edit ${sameOrganization ? "own" : "outside"} organization's ${targetType}`, async ({
    app,
    data,
    graph
  }) => {
    const actor = await graph.actor("Editor", {
      type,
      administrates: [graph.organization]
    })
    const target = await data.actor(
      "Target",
      sameOrganization ? graph.organization : graph.outside,
      { type: targetType }
    )
    await app.login(`/people/${target.person.uuid}`, actor)
    await expect(app.page.locator(".legend .title-text").first()).toContainText(
      target.fullName
    )
    if (canEdit) {
      await validateUserCanEditUserForCurrentPage(app, true)
      await editAndSavePositionFromCurrentUserPage(app, true)
    } else {
      await expect(app.page.locator(".edit-person")).toHaveCount(0)
      await app.page.locator(".position-name").click()
      await expect(
        app.page.locator(".legend .title-text").first()
      ).toContainText(target.position.name)
      await expect(app.page.locator(".edit-position")).toHaveCount(0)
    }
  })
}

for (const role of ["Advisor", "Principal"]) {
  test(`Superuser: administer ${role} organization and exclude outside positions`, async ({
    app,
    data,
    graph
  }) => {
    const child = await data.organization(`${role} child`, {
      parentOrg: { uuid: graph.organization.uuid }
    })
    const actor = await graph.actor(`${role} administrator`, {
      type: "SUPERUSER",
      administrates: [graph.organization]
    })
    const person = await data.person(`${role} member`)
    const position = await data.position(`${role} member`, child)
    await data.assign(person, position)
    const outsidePosition = await data.position(
      `${role} outside`,
      graph.outside
    )
    await app.login(`/organizations/${child.uuid}`, actor)
    await findSuperuserLink(
      app,
      actor.fullName,
      `${graph.organization.shortName} | ${graph.organization.longName}`
    )
    await app.pageHelpers.clickPersonNameFromSupportedPositionsFieldset(
      `${person.rank} ${person.givenName} ${person.familyName}`
    )
    await validateUserCanEditUserForCurrentPage(app, true)
    await app.login(`/positions/${outsidePosition.uuid}`, actor)
    await expect(app.page.locator(".legend .title-text").first()).toContainText(
      outsidePosition.name
    )
    await expect(app.page.locator(".edit-position")).toHaveCount(0)
  })
}

for (const type of ["SUPERUSER", "ADMINISTRATOR"]) {
  test(`${type}: organization and location field permissions`, async ({
    app,
    data,
    graph
  }) => {
    const actor = await graph.actor("Fields", {
      type,
      administrates: [graph.organization]
    })
    const location = await data.location("Permission location")
    await app.login(`/organizations/${graph.outside.uuid}`, actor)
    await expect(app.page.locator(".legend .title-text").first()).toContainText(
      graph.outside.shortName
    )
    if (type === "ADMINISTRATOR") await validateAdminOrgPermissions(app)
    else await validateSuperuserNonAdministratingOrgPermissions(app)
    await app.login(`/locations/${location.uuid}`, actor)
    if (type === "ADMINISTRATOR") await validateAdminLocationPermissions(app)
    else await validateSuperuserLocationPermissions(app)
  })
}

for (const superuserType of [
  "CAN_CREATE_TOP_LEVEL_ORGANIZATIONS_OR_TASKS",
  "CAN_CREATE_OR_EDIT_ANY_ORGANIZATION_OR_TASK"
]) {
  for (const kind of ["organization", "task"]) {
    test(`${superuserType}: create ${kind} and unrelated edit permission`, async ({
      app,
      data,
      graph
    }) => {
      const actor = await graph.actor("Extended", {
        type: "SUPERUSER",
        superuserType
      })
      const target =
        kind === "organization"
          ? graph.outside
          : await data.task("Outside task")
      await app.login("/", actor)
      if (kind === "organization") await canCreateOrganization(app)
      else await canCreateTask(app)
      await app.login(`/${kind}s/${target.uuid}`, actor)
      await expect(
        app.page.locator(".legend .title-text").first()
      ).toContainText(target.shortName)
      if (superuserType === "CAN_CREATE_OR_EDIT_ANY_ORGANIZATION_OR_TASK") {
        if (kind === "organization") await validateAdminOrgPermissions(app)
        else await validateSuperuserResponsibleForTaskPermissions(app)
      } else {
        if (kind === "organization")
          await validateSuperuserNonAdministratingOrgPermissions(app)
        else await validateSuperuserNotResponsibleForTaskPermissions(app)
      }
    })
  }
}

async function findSuperuserLink(
  app,
  desiredSuperuserName,
  desiredOrganizationsAdministrated
) {
  const $superuserRows = await app.$$("[id=superuser-table] tbody tr")
  let $foundSuperuser
  let $foundOrganizationsAdministrated
  for (const $superuserRow of $superuserRows) {
    const $superuserLink = await $superuserRow
      .locator("td:nth-child(5) span a")
      .first()
    const superuserName = await $superuserLink.innerText()
    if (superuserName === desiredSuperuserName) {
      $foundSuperuser = $superuserLink
      const organizationsAdministratedElem = await $superuserRow
        .locator("td:nth-child(4)")
        .first()
      const organizationsAdministrated =
        await organizationsAdministratedElem.innerText()
      if (organizationsAdministrated === desiredOrganizationsAdministrated) {
        $foundOrganizationsAdministrated = organizationsAdministrated
      }
      break
    }
  }
  if (!$foundSuperuser) {
    fail(
      `Could not find superuser '${desiredSuperuserName}'. The data does not match what this test expects.`
    )
  }
  if (!$foundOrganizationsAdministrated) {
    fail(
      `Organizations administrated by '${desiredSuperuserName}' do not match what this test expects.`
    )
  }
  return $foundSuperuser
}

async function validateUserCanEditUserForCurrentPage(app, canChangeName) {
  const { $, assertElementEnabled, assertElementText } = app

  const $editPersonButton = await $(".edit-person")
  await expect($editPersonButton).toBeVisible()
  await $editPersonButton.click()
  if (canChangeName) {
    // The user can should be able to change the name
    await assertElementEnabled(
      '[name="familyName"]',
      "Family name of a person should be enabled"
    )
    await assertElementEnabled(
      '[name="givenName"]',
      "Given name of a person should be enabled"
    )
  } else {
    await expect(app.page.locator('[name="familyName"]')).toBeDisabled()
    await expect(app.page.locator('[name="givenName"]')).toBeDisabled()
  }

  // Check that user can change the biography
  const $bioTextArea = await $(".biography .editable")
  await expect
    .poll(async () => {
      const originalBioText = await $bioTextArea.innerText()
      return originalBioText !== ""
    })
    .toBeTruthy()
  const originalBioText = (await $bioTextArea.innerText())
    .replace(/\uFEFF/g, "")
    .trim()
  const fakeBioText = ` fake bio ${uuidv4()}`
  await $bioTextArea.fill(`${originalBioText}\n${fakeBioText}`)
  await $bioTextArea.blur()

  await app.pageHelpers.clickFormBottomSubmit()

  await expect(app.page.locator(".alert-success")).toHaveText("Person saved")
  await assertElementText(
    await $(".biography .editable"),
    `${originalBioText}\n${fakeBioText}`
  )
}

async function editAndSavePositionFromCurrentUserPage(app, validateTrue) {
  const { $ } = app
  const $positionName = await $(".position-name")
  await $positionName.click()
  await validationEditPositionOnCurrentPage(app, validateTrue)
}

async function validationEditPositionOnCurrentPage(app, validateTrue) {
  const { $, assertElementText, mediumWaitMs } = app
  const $editButton = await $(".edit-position")
  await expect($editButton).toBeVisible({
    timeout: mediumWaitMs
  })
  await $editButton.click()
  await app.pageHelpers.clickFormBottomSubmit()

  if (validateTrue) {
    await expect(app.page.locator(".alert-success")).toHaveText(
      "Position saved"
    )
  } else {
    await assertElementText(
      await $(".alert"),
      "Forbidden: Exception while fetching data (/updatePosition) : You do not have permissions to do this"
    )
  }
}

async function validateSuperuserNonAdministratingOrgPermissions(app) {
  const { assertElementNotPresent, shortWaitMs } = app
  await assertElementNotPresent(
    "#editButton",
    "Superusers should not be able to edit non-administrating organizations",
    shortWaitMs
  )
}

async function validateAdminOrgPermissions(app) {
  const { $, assertElementEnabled } = app
  const $editOrgButton = await $("#editButton")
  await expect($editOrgButton).toBeVisible()
  await $editOrgButton.click()
  await assertElementEnabled(
    "#parentOrg",
    "Field parentOrganization of an organization should be enabled for admins"
  )
  await assertElementEnabled(
    "#shortName",
    "Field shortName of an organization should be enabled for admins"
  )
  await assertElementEnabled(
    "#longName",
    "Field longName of an organization should be enabled for admins"
  )
}

async function validateSuperuserLocationPermissions(app) {
  const { $, assertElementEnabled, assertElementDisabled } = app
  const $editLocationButton = await $("#editButton")
  await expect($editLocationButton).toBeVisible()
  await $editLocationButton.click()
  await assertElementDisabled(
    '[name="name"]',
    "Field name of a location should be disabled for superusers"
  )
  await assertElementEnabled(
    '[name="status"]',
    "Field status of a location should be enabled for superusers"
  )
}

async function validateAdminLocationPermissions(app) {
  const { $, assertElementEnabled } = app
  const $editLocationButton = await $("#editButton")
  await expect($editLocationButton).toBeVisible()
  await $editLocationButton.click()
  await assertElementEnabled(
    '[name="name"]',
    "Field name of a location should be enabled for admins"
  )
  await assertElementEnabled(
    '[name="status"]',
    "Field status of a location should be enabled for admins"
  )
}

async function canCreateOrganization(app) {
  const { $, shortWaitMs } = app
  const $createButton = await $("#createButton")
  await $createButton.click()
  const $createOrganizationButton = await $("#new-organization")
  await $createOrganizationButton.click()
  const $organizationInput = await $("#shortName")
  await expect($organizationInput).toBeVisible({
    timeout: shortWaitMs
  })

  // Cancel Create Organization
  const $cancelButton = await app.page
    .locator("xpath=" + '//button[text()="Cancel"]')
    .first()
  await $cancelButton.click()
}

async function validateSuperuserNotResponsibleForTaskPermissions(app) {
  const { assertElementNotPresent, shortWaitMs } = app
  await assertElementNotPresent(
    "#editButton",
    "Superusers should not be able to edit not-responsible-for tasks",
    shortWaitMs
  )
}

async function validateSuperuserResponsibleForTaskPermissions(app) {
  const { $, assertElementEnabled } = app
  const $editTaskButton = await $("#editButton")
  await expect($editTaskButton).toBeVisible()
  await $editTaskButton.click()
  await assertElementEnabled(
    "#parentTask",
    "Field parentTask of a task should be enabled for admins"
  )
  await assertElementEnabled(
    "#shortName",
    "Field shortName of a task should be enabled for admins"
  )
  await assertElementEnabled(
    "#longName",
    "Field longName of a task should be enabled for admins"
  )
}

async function canCreateTask(app) {
  const { $, shortWaitMs } = app
  const $createButton = await $("#createButton")
  await $createButton.click()
  const $createTaskButton = await $("#new-objective")
  await $createTaskButton.click()
  const $taskInput = await $("#shortName")
  await expect($taskInput).toBeVisible({
    timeout: shortWaitMs
  })

  // Cancel Create Task
  const $cancelButton = await app.page
    .locator("xpath=" + '//button[text()="Cancel"]')
    .first()
  await $cancelButton.click()
}
