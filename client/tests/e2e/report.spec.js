import moment from "moment"
import { ownReports } from "../support/reports.js"
import { expect, test } from "./support.js"

const ownCreatedReports = ownReports(test)

test("Verify that validations work", async ({ app }) => {
  const {
    assertElementText,
    $,
    $$,
    assertElementNotPresent,
    pageHelpers,
    shortWaitMs
  } = app
  await pageHelpers.goHomeAndThenToReportsPage()
  await ownCreatedReports(app.page)
  await assertElementText(await $(".legend .title-text"), "Create a new Report")
  async function verifyFieldIsRequired($input, id, type, fieldName) {
    await $input.click()
    await $input.clear()
    const $searchBarInput = await $("#searchBarInput")
    await $searchBarInput.click()
    await expect(
      app.page.locator(`${type}[id="${id}"] ~ div[class="invalid-feedback"]`)
    ).toBeVisible()
    await $input.pressSequentially("user input")
    await $input.press("Tab") // fire blur event
    // send escape key to make sure any pop-ups are being closed
    await app.page.keyboard.press("Escape")
    await expect(
      app.page.locator(`textarea[id="${id}"] ~ div[class="invalid-feedback"]`),
      `After typing in ${fieldName} field, warning state goes away`
    ).toHaveCount(0)
  }
  const $meetingGoalInput = await $("#intent")
  // check that parent div.form-group does not have class 'has-error'
  await expect(
    app.page.locator('textarea[id="intent"] ~ div[class="invalid-feedback"]'),
    "Meeting goal does not start in an invalid state"
  ).toHaveCount(0)
  await expect(
    $meetingGoalInput,
    "Meeting goal field starts blank"
  ).toHaveValue("")

  // check that parent div.form-group now has a class 'has-error'
  await verifyFieldIsRequired(
    $meetingGoalInput,
    "intent",
    "textarea",
    "Meeting goal"
  )
  const $engagementDate = await $("#engagementDate")
  await expect(
    $engagementDate,
    "Engagement date field starts blank"
  ).toHaveValue("")
  await $engagementDate.click()

  await pageHelpers.clickTodayButton()

  // set time as well
  const $hourInput = await $("input.bp6-timepicker-input.bp6-timepicker-hour")
  // clear field, enter data, fire blur event
  await $hourInput.fill("23")
  await $hourInput.press("Tab")
  const $minuteInput = await $(
    "input.bp6-timepicker-input.bp6-timepicker-minute"
  )
  // clear field, enter data, fire blur event
  await $minuteInput.fill("45")
  await $minuteInput.press("Tab")

  await pageHelpers.closeDatePicker("#engagementDate")

  // check date and time
  const dateTimeFormat = "DD-MM-YYYY HH:mm"
  const dateTimeValue = await $engagementDate.inputValue()
  const expectedDateTime = moment().hour(23).minute(45).format(dateTimeFormat)
  expect(
    dateTimeValue,
    'Clicking the "today" button puts the current date in the engagement field'
  ).toBe(expectedDateTime)
  const $locationInput = await $("#location")
  await expect($locationInput, "Location field starts blank").toHaveValue("")
  const $locationShortcutButton = await $("#location-shortcut-list button")
  await $locationShortcutButton.click()
  await expect(
    $locationInput,
    "Clicking the shortcut adds a location"
  ).toHaveValue("General Hospital")
  await assertElementNotPresent(
    "#cancelledReason",
    "Cancelled reason should not be present initially",
    shortWaitMs
  )
  const $atmosphereFormGroup = await $(".atmosphere-form-group")
  await expect(
    $atmosphereFormGroup,
    "Atmospherics form group should be shown by default"
  ).toBeVisible()
  await assertElementNotPresent(
    "#atmosphere-details",
    "Atmospherics details should not be displayed before choosing atmospherics",
    shortWaitMs
  )
  const $positiveAtmosphereButton = await $('label[for="atmosphere_POSITIVE"]')
  await $positiveAtmosphereButton.click()
  const $atmosphereDetails = await $("#atmosphereDetails")
  await expect($atmosphereDetails).toHaveAttribute(
    "placeholder",
    "Describe the atmosphere"
  )
  const $neutralAtmosphereButton = await $('label[for="atmosphere_NEUTRAL"]')
  await $neutralAtmosphereButton.click()
  await expect($atmosphereDetails).toHaveAttribute(
    "placeholder",
    "Describe the atmosphere"
  )
  const $negativeAtmosphereButton = await $('label[for="atmosphere_NEGATIVE"]')
  await $negativeAtmosphereButton.click()
  await expect($atmosphereDetails).toHaveAttribute(
    "placeholder",
    "Describe the atmosphere"
  )
  const $reportPeopleFieldsetTitle = await $(
    "#reportPeople-fieldset .title-text"
  )
  await assertElementText(
    $reportPeopleFieldsetTitle,
    "People involved in this engagement",
    "People fieldset should have correct title for an uncancelled enagement"
  )
  const $cancelledCheckbox = await $(".cancelled-checkbox input")
  // Move element into view

  await $cancelledCheckbox.scrollIntoViewIfNeeded()
  await $cancelledCheckbox.click()
  await assertElementNotPresent(
    ".atmosphere-form-group",
    "After cancelling the enagement, the atmospherics should be hidden",
    shortWaitMs
  )
  const $cancelledReason = await $(".cancelled-reason-form-group")
  await expect(
    $cancelledReason,
    "After cancelling the engagement, the cancellation reason should appear"
  ).toBeVisible()
  await assertElementText(
    $reportPeopleFieldsetTitle,
    "People who will be involved in this planned engagement",
    "People fieldset should have correct title for a cancelled enagement"
  )
  let $advisorAttendeesRows = await $$(".advisorAttendeesTable tbody tr")
  expect(
    $advisorAttendeesRows.length,
    "Advisor attendees table starts with 1 body rows"
  ).toBe(1)
  let $interlocutorAttendeesRows = await $$(
    ".interlocutorAttendeesTable tbody tr"
  )
  expect(
    $interlocutorAttendeesRows.length,
    "Interlocutor attendees table starts with 1 body rows"
  ).toBe(1)
  const [
    $advisorControls,
    /* eslint-disable no-unused-vars */ $advisorConflictBtn /* eslint-enable no-unused-vars */,
    $advisorName,
    $advisorPosition,
    /* eslint-disable no-unused-vars */ $advisorLocation /* eslint-enable no-unused-vars */,
    $advisorOrg
  ] = await $$(".advisorAttendeesTable tbody tr:first-child td")
  await expect(
    $advisorControls.locator("[name = 'primaryAttendeeADVISOR']").first(),
    "Advisor primary attendee checkbox should be checked"
  ).toBeChecked()
  await assertElementText($advisorName, "CIV Erin Erinson")
  await assertElementText($advisorPosition, "EF 2.2 Advisor D")
  await assertElementText($advisorOrg, "EF 2.2")
  const $addAttendeeShortcutButtons = await $$(
    "#reportPeople-shortcut-list button"
  )
  // Add all recent attendees
  const nrAttendees = $addAttendeeShortcutButtons.length
  for (let i = 0; i < nrAttendees; i++) {
    await (await $("#reportPeople-shortcut-list button")).click()
  }
  $advisorAttendeesRows = await $$(".advisorAttendeesTable tbody tr")
  $interlocutorAttendeesRows = await $$(".interlocutorAttendeesTable tbody tr")
  expect(
    $advisorAttendeesRows.length + $interlocutorAttendeesRows.length,
    "Clicking the shortcut buttons adds rows to the table"
  ).toBe(
    // should match the number of shortcut buttons plus the initial advisor and interlocutor
    nrAttendees + 2
  )
  const $submitButton = await $("#formBottomSubmit")
  await $submitButton.click()
  await pageHelpers.assertReportShowStatusText(
    "This is a DRAFT report and hasn't been submitted."
  )
  await app.logout()
})
