// UI-created reports belong to their workflow, including when later UI steps fail.
export function ownReports(test) {
  const reports = new Set()
  const registrations = new Set()
  const errors = []

  test.afterAll(async ({ api }) => {
    await Promise.all(registrations)
    const results = await Promise.allSettled(
      [...reports].map(uuid =>
        api.graphql("mutation($uuid:String!){deleteReport(uuid:$uuid)}", {
          uuid
        })
      )
    )
    errors.push(
      ...results
        .filter(result => result.status === "rejected")
        .map(result => result.reason)
    )
    if (errors.length)
      throw new AggregateError(errors, "Report workflow cleanup failed")
  })

  return page => {
    page.on("response", response => {
      if (!response.url().endsWith("/graphql") || !response.ok()) return
      const body = response.request().postDataJSON()
      if (!body?.query?.includes("createReport(")) return
      const registration = response
        .json()
        .then(result => {
          if (result.data?.createReport?.uuid)
            reports.add(result.data.createReport.uuid)
        })
        .catch(error => errors.push(error))
        .finally(() => registrations.delete(registration))
      registrations.add(registration)
    })
  }
}
