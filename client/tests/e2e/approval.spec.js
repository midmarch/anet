import { randomUUID } from "node:crypto"
import { ownReports } from "../support/reports.js"
import { expect, test } from "./support.js"

// Start the long approval chain early, and keep its two dependent steps together.
test.describe.configure({ mode: "serial" })
const ownCreatedReports = ownReports(test)
const reportIntent = `meeting goal ${randomUUID()}`
let testReportURL

test("Draft and submit a report", async ({ app }) => {
  const {
    pageHelpers,
    $,
    $$,
    assertElementText,
    assertElementNotPresent,
    shortWaitMs,
    mediumWaitMs
  } = app
  await app.login("/", "erin")
  await ownCreatedReports(app.page)
  const $createButton = await app.$("#createButton")
  await $createButton.click()
  await pageHelpers.writeInForm("#intent", reportIntent)
  const $engagementDate = await $("#engagementDate")
  await $engagementDate.click()

  await pageHelpers.clickTodayButton()

  await pageHelpers.closeDatePicker("#engagementDate")
  const $locationAdvancedSelect = await pageHelpers.chooseAdvancedSelectOption(
    "#location",
    "ge",
    2
  )
  await expect(
    $locationAdvancedSelect,
    "Clicking a location advanced single select widget suggestion populates the input field."
  ).toHaveValue("General Hospital")
  const $positiveAtmosphereButton = await $('label[for="atmosphere_POSITIVE"]')
  await $positiveAtmosphereButton.click()
  const $attendeesAdvancedSelect1 =
    await pageHelpers.chooseAdvancedSelectOption(
      "#reportPeople",
      "topferness, christopf"
    )
  const $newReportTitle = await app.page
    .locator("xpath=" + '//h4/span[text()="Create a new Report"]')
    .first()
  await $newReportTitle.click()

  await expect(
    $attendeesAdvancedSelect1,
    "Closing the attendees advanced multi select overlay empties the input field."
  ).toHaveValue("")
  const [
    $interlocutorControls1,
    /* eslint-disable no-unused-vars */ $interlocutorConflictBtn /* eslint-enable no-unused-vars */,
    $interlocutorName1,
    $interlocutorPosition1,
    /* eslint-disable no-unused-vars */ $interlocutorLocation1 /* eslint-enable no-unused-vars */,
    $interlocutorOrg1
  ] = await $$(".interlocutorAttendeesTable tbody tr:nth-child(2) td")
  const $interlocutorPrimaryInput1 = await $interlocutorControls1
    .locator("[name = 'primaryAttendeeINTERLOCUTOR']")
    .first()
  await expect(
    $interlocutorPrimaryInput1,
    "Interlocutor primary attendee checkbox should be checked"
  ).toBeChecked()
  await assertElementText($interlocutorName1, "CIV Christopf Topferness")
  await assertElementText(
    $interlocutorPosition1,
    "Planning Captain, MOD-FO-00004"
  )
  await assertElementText($interlocutorOrg1, "MoD | Ministry of Defense")
  const $attendeesAdvancedSelect2 =
    await pageHelpers.chooseAdvancedSelectOption(
      "#reportPeople",
      "steveson, steve"
    )
  await $newReportTitle.click()

  await expect(
    $attendeesAdvancedSelect2,
    "Closing the attendees advanced multi select overlay empties the input field."
  ).toHaveValue("")
  const [
    $interlocutorControls2,
    /* eslint-disable no-unused-vars */ $interlocutorAuthorConflictBtn /* eslint-enable no-unused-vars */,
    $interlocutorName2 /* eslint-disable no-unused-vars */,
    $interlocutorPosition2,
    $interlocutorLocation2,
    $interlocutorOrg2 /* eslint-enable no-unused-vars */
  ] = await $$(".interlocutorAttendeesTable tbody tr:last-child td")
  await assertElementText($interlocutorName2, "OF-4 Steve Steveson")
  const $interlocutorPrimaryInput2 = await $interlocutorControls2
    .locator("[name = 'primaryAttendeeINTERLOCUTOR']")
    .first()
  await expect(
    $interlocutorPrimaryInput2,
    "Second interlocutor primary attendee checkbox should not be checked"
  ).not.toBeChecked()
  await $interlocutorPrimaryInput2.click()
  await expect(
    $interlocutorPrimaryInput2,
    "Second interlocutor primary attendee checkbox should now be checked"
  ).toBeChecked()
  await expect(
    $interlocutorPrimaryInput1,
    "First interlocutor primary attendee checkbox should no longer be checked"
  ).not.toBeChecked()
  const $tasksAdvancedSelect = await pageHelpers.chooseAdvancedSelectOption(
    "#tasks",
    "2.B",
    2
  )
  const $tasksTitle = await app.page
    .locator("xpath=" + '//h4/span[text()="Objectives"]')
    .first()
  await $tasksTitle.click()

  await expect(
    $tasksAdvancedSelect,
    "Closing the tasks advanced multi select overlay empties the input field."
  ).toHaveValue("")
  const $newTaskRow = await $("#tasks-tasks table tbody tr td")
  await assertElementText($newTaskRow, "EF 2\n»\n2.B")
  await pageHelpers.writeInForm("#keyOutcomes", "key outcomes")
  await pageHelpers.writeInForm("#nextSteps", "next steps")
  await pageHelpers.writeInForm(
    ".reportTextField .editable",
    "engagement details"
  )
  const editorCssPath = ".reportSensitiveInformationField .editable"
  const $reportSensitiveInformationField = await $(editorCssPath)
  await expect(
    $reportSensitiveInformationField,
    'Report sensitive info should not be present before "add sensitive information" button is clicked"'
  ).not.toBeVisible()
  const $addSensitiveInfoButton = await $("#toggleSensitiveInfo")
  await $addSensitiveInfoButton.click()
  await expect($reportSensitiveInformationField).toBeVisible()
  await pageHelpers.writeInForm(editorCssPath, "sensitive info")
  const $communitiesButton = await $('button[value="AuthorizationGroup"]')
  await $communitiesButton.click()
  // Wait for the filters to change

  const $communitiesInput = await $("input#authorizedMembers")
  await $communitiesInput.click()
  // Wait for the pop-up to fill

  // Add all communities
  const $allCommunities = await $$(
    "#entitySelect-popover input[type='checkbox']"
  )
  for (const $community of $allCommunities) {
    await $community.click()
  }
  const $formButtonSubmit = await $("#formBottomSubmit")
  await expect($formButtonSubmit).toBeEnabled({
    timeout: mediumWaitMs
  })
  await $formButtonSubmit.click()
  await pageHelpers.assertReportShowStatusText(
    "This is a DRAFT report and hasn't been submitted."
  )
  await expect(app.page, "URL is updated to reports/show page").toHaveURL(
    /\/reports\/[0-9a-f-]+/
  )
  testReportURL = new URL(app.page.url()).pathname
  await app.page.reload()
  await app.waitForLoadingFinished()
  await expect(app.page.locator("#report-text .editable")).toHaveText(
    "engagement details"
  )
  await expect(
    app.page
      .getByRole("heading", { name: "Sensitive information", exact: true })
      .locator("..")
      .locator(".editable")
  ).toHaveText("sensitive info")
  const $submitReportButton = await $("#submitReportButton")
  await $submitReportButton.click()
  await expect($submitReportButton).toBeHidden({
    timeout: mediumWaitMs
  })
  await assertElementNotPresent(
    "#submitReportButton",
    "Submit button should be gone",
    shortWaitMs
  )
  await pageHelpers.assertReportShowStatusText(
    "This report is PENDING approvals."
  )
  const $allertSuccess = await app.page.locator(".alert-success").first()
  await expect($allertSuccess).toBeVisible({
    timeout: mediumWaitMs
  })
  await assertElementText(
    $allertSuccess,
    "Report submitted",
    "Clicking the submit report button displays a message telling the user that the action was successful."
  )
  await app.logout()
})

test("Publish report chain", async ({ app }) => {
  const { pageHelpers, $, $$, assertElementText, mediumWaitMs } = app

  // First Jacob needs to approve the report, then Rebecca can approve the report
  await approveReport(app, "jacob")
  await approveReport(app, "rebecca")
  // Then the task owner can approve the report
  await approveReport(app, "henry")

  // Admin user needs to publish the report
  await app.login("/", "arthur")
  const $homeTileArthur = await $$(".home-tile")
  const [
    /* eslint-disable no-unused-vars */ $draftReportsArthur,
    $reportsPendingAll,
    $reportsPendingArthur,
    $plannedEngagementsArthur,
    $reportsSensitiveInfo /* eslint-enable no-unused-vars */,
    $approvedReports
  ] = $homeTileArthur
  await expect($approvedReports).toBeVisible({
    timeout: mediumWaitMs
  })
  await $approvedReports.click()
  await expect($approvedReports).toBeHidden({
    timeout: mediumWaitMs
  })
  const $reportsApprovedSummaryTab = await $(
    ".report-collection button[value='summary']"
  )
  await $reportsApprovedSummaryTab.click()
  const $readApprovedReportButton = await $(
    ".read-report-button[href='" + testReportURL + "']"
  )
  await expect($readApprovedReportButton).toBeEnabled({
    timeout: mediumWaitMs
  })
  await $readApprovedReportButton.click()
  await pageHelpers.assertReportShowStatusText("This report is APPROVED.")
  const $arthurPublishButton = await $(".publish-button")
  await $arthurPublishButton.click()
  await expect($arthurPublishButton).toBeHidden({
    timeout: mediumWaitMs
  })

  // check if page is redirected to search results

  const $rollupLink = await app.page
    .getByRole("link", {
      name: "Daily Rollup",
      exact: true
    })
    .first()
  await expect($rollupLink).toBeEnabled({
    timeout: mediumWaitMs
  })
  await $rollupLink.click()
  await expect(
    app.page,
    'Clicking the "Daily Rollup" link takes the user to the rollup page'
  ).toHaveURL(/\/rollup$/)
  await $("#daily-rollup")

  const $rollupTableTab = await $(".report-collection button[value='table']")
  await $rollupTableTab.click()
  const $reportCollectionTable = await $(".report-collection table")
  await expect($reportCollectionTable).toBeVisible({
    timeout: mediumWaitMs
  })
  const $approvedIntent = await $reportCollectionTable
    .getByRole("link", {
      name: reportIntent,
      exact: true
    })
    .first()
  await assertElementText(
    $approvedIntent,
    reportIntent,
    "Daily Rollup report list includes the recently approved report"
  )
  await app.logout()
})

async function approveReport(app, user) {
  const { pageHelpers, $, $$, mediumWaitMs } = app
  await app.login("/", user)
  const $homeTile = await $$(".home-tile")
  const [
    /* eslint-disable no-unused-vars */ $draftReports /* eslint-enable no-unused-vars */,
    $reportsPending /* eslint-disable no-unused-vars */,
    $orgReports,
    $plannedEngagements
    /* eslint-enable no-unused-vars */
  ] = $homeTile
  await expect($reportsPending).toBeVisible({
    timeout: mediumWaitMs
  })
  await $reportsPending.click()
  await expect($reportsPending).toBeHidden({
    timeout: mediumWaitMs
  })
  const $reportsPendingSummaryTab = await $(
    ".report-collection button[value='summary']"
  )
  await expect($reportsPendingSummaryTab).toBeEnabled()
  await $reportsPendingSummaryTab.click()
  const $readReportButton = await $(
    ".read-report-button[href='" + testReportURL + "']"
  )
  await expect($readReportButton).toBeEnabled({
    timeout: mediumWaitMs
  })
  await $readReportButton.click()
  await pageHelpers.assertReportShowStatusText(
    "This report is PENDING approvals."
  )
  const $ApproveButton = await $(".approve-button")
  await expect($ApproveButton).toBeEnabled({
    timeout: mediumWaitMs
  })
  await $ApproveButton.click()
  await expect($ApproveButton).toBeHidden({
    timeout: mediumWaitMs
  })
  await app.logout()
}
