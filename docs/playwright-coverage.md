# Playwright coverage inventory

The regression case titles and describe paths match `improve-playwright-tests`: 499 cases for the default dictionary and 419 without custom fields. Display setup for print report/person pages now opens the same seeded records directly; assertions and UI navigation/creation scenarios are retained. Editing coordinates starts with a private API-created location instead of repeating UI creation. The My Events summary selects the seeded event by name, so it does not depend on events created by other files occupying earlier rows.

`python3 scripts/check-playwright-shards.py` discovers all tests, contracts and both shards and rejects overlap, omissions or a regression file split between shards. With `--baseline /path/to/base-checkout`, it also compares every regression case title/path to the base checkout. The full machine-readable inventory is generated under `client/build/throughput/coverage.json`.

| Configuration      | Seed contracts on shard 1 | Scenario shard 1 | Scenario shard 2 | Total |
| ------------------ | ------------------------: | ---------------: | ---------------: | ----: |
| Default regression |                        14 |              252 |              233 |   499 |
| No custom fields   |                        14 |              223 |              182 |   419 |
| E2E                |                         0 |               15 |               15 |    30 |

The current E2E count is 30 rather than 23 because the 12 permission cases became 19 independent cases. The two dependent report creation/approval cases move together to `approval.spec.js`, scheduled early so their long chain can overlap the other cases. Independent form validation stays in `report.spec.js`. Five additional infrastructure cases exercise auth isolation, invalid restored sessions, successful/failed setup cleanup and API errors; they run separately on E2E shard 2.

## Seed contracts

These files run once with one worker on a fresh database, followed by a database reset before sharded scenarios:

| File below `client/tests/playwright/baseSpecs` | Contract                                                   |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `homeTiles.spec.js`                            | Seeded report ownership, pending counts and saved searches |
| `myReports.spec.js`                            | Ordered seeded report rows and attachment summaries        |
| `reportsAggregatedOverTime.spec.js`            | Published-report aggregates and date buckets               |
| `searchFilters/locationFilter.spec.js`         | Complete seeded location hierarchy and filtering           |
| `searchFilters/taskFilter.spec.js`             | Complete seeded objective hierarchy and filtering          |

The location hierarchy contract asserts 253 collapsed rows and 285 expanded rows on the untouched seed. It no longer requires locations created by another spec. Standalone combined runs allow additional locations created by their UI workflows.

Legacy merge/assessment and report state workflows keep their rich seeded graphs and dependent cases within their owning spec. They are not split at the individual-case level. Shards use separate databases, and the seed-contract phase cannot observe their changes. The new permission/position graphs and coordinate-edit records are private to their case; their factories never mutate referenced seed records. Onboarding uses a fresh Keycloak identity and cleans up its UI-created person. Saved searches belong to a private user, including cleanup after failures. These workflows run in ordinary shards, and preferences only reads the page.

## Permission scenarios

All capability checks from the previous permission file have a destination below. Both position workflows retain their assertions, including assignment history, vacancy/supported-position tables, regularization on removal, primary/additional assignment options, permission transfer, and the original position becoming regular. Each now creates its own graph and can run independently.

| Original permission case                                                                   | Independent replacement cases                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checking superuser permissions`                                                           | SUPERUSER person creation controls; edit own biography and position; edit own organization's SUPERUSER; administer Advisor organization and exclude outside positions; administer Principal organization and exclude outside positions; organization/location field permissions |
| `superuser cannot edit administrator`                                                      | SUPERUSER cannot edit outside organization's ADMINISTRATOR (same organization boundary as the original Rebecca/Arthur scenario)                                                                                                                                                 |
| `superuser cannot edit people from the organizations their position is not administrating` | SUPERUSER cannot edit outside organization's SUPERUSER                                                                                                                                                                                                                          |
| `checking regular user permissions`                                                        | REGULAR edit own biography and position permissions; also explicitly asserts name fields are disabled                                                                                                                                                                           |
| `Regular user cannot edit superuser people or positions`                                   | REGULAR cannot edit own organization's SUPERUSER                                                                                                                                                                                                                                |
| `Regular user cannot edit admin people or positions`                                       | REGULAR cannot edit own organization's ADMINISTRATOR                                                                                                                                                                                                                            |
| `checking admin permissions`                                                               | ADMINISTRATOR person creation controls; edit own biography and position; organization/location field permissions                                                                                                                                                                |
| `admins can edit superusers and their positions`                                           | ADMINISTRATOR can edit own organization's SUPERUSER                                                                                                                                                                                                                             |
| `checking superuser that can create top-level organizations permissions`                   | CAN_CREATE_TOP_LEVEL_ORGANIZATIONS_OR_TASKS create organization and unrelated edit permission                                                                                                                                                                                   |
| `checking superuser that can edit any organizations permissions`                           | CAN_CREATE_OR_EDIT_ANY_ORGANIZATION_OR_TASK create organization and unrelated edit permission                                                                                                                                                                                   |
| `checking superuser that can create top-level tasks permissions`                           | CAN_CREATE_TOP_LEVEL_ORGANIZATIONS_OR_TASKS create task and unrelated edit permission                                                                                                                                                                                           |
| `checking superuser that can edit any tasks permissions`                                   | CAN_CREATE_OR_EDIT_ANY_ORGANIZATION_OR_TASK create task and unrelated edit permission                                                                                                                                                                                           |

All biography edits still verify saved text. Each self-edit case reloads the page to check persistence. No retries or skips are introduced.
