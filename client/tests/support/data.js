import { randomUUID } from "node:crypto"
import { keycloakURL, realm } from "./auth.js"

const HOSPITAL = "0855fb0a-995e-4a79-a132-4024ee2983ff"

// Fixture objects are private to one workflow. Seed records referenced by a
// fixture remain read-only. Teardown never deletes or archives seed records.
export class TestData {
  constructor(api) {
    this.api = api
    this.namespace = `pw-${randomUUID().slice(0, 8)}`
    this.resources = []
    this.identities = []
  }

  name(label) {
    return `${label} ${this.namespace}`
  }

  own(kind, entity) {
    if (!entity.uuid) throw new Error(`Cannot own a ${kind} without its UUID`)
    if (
      !this.resources.some(
        resource =>
          resource.kind === kind && resource.entity.uuid === entity.uuid
      )
    )
      this.resources.push({ kind, entity })
    return entity
  }

  async create(kind, input) {
    const type = kind[0].toUpperCase() + kind.slice(1)
    const operation = `create${type}`
    const data = await this.api.graphql(
      `mutation($input:${type}Input!){${operation}(${kind}:$input){uuid updatedAt ${kind === "person" ? "users { uuid domainUsername }" : ""}}}`,
      { input }
    )
    const entity = { ...input, ...data[operation] }
    return this.own(kind, entity)
  }

  async update(kind, entity, changes, actor) {
    const type = kind[0].toUpperCase() + kind.slice(1)
    const current = await this.api
      .graphql(`query($uuid:String!){${kind}(uuid:$uuid){updatedAt}}`, {
        uuid: entity.uuid
      })
      .catch(error => {
        if (error.status === 404) return { [kind]: null }
        throw error
      })
    if (!current[kind]) return
    await this.api.graphql(
      `mutation($input:${type}Input!){update${type}(${kind}:$input)}`,
      { input: { ...entity, updatedAt: current[kind].updatedAt, ...changes } },
      actor
    )
    Object.assign(entity, changes)
  }

  async organization(label, input = {}) {
    return this.create("organization", {
      shortName: this.name(label),
      longName: `${label} fixture organization`,
      status: "ACTIVE",
      location: { uuid: HOSPITAL },
      ...input
    })
  }

  async person(label, input = {}) {
    this.references ??= await this.api.graphql("{me{country{uuid}}}")
    return this.create("person", {
      givenName: label,
      familyName: this.namespace,
      rank: "CIV",
      gender: "MALE",
      country: this.references.me.country,
      status: "ACTIVE",
      biography: "<p>Fixture biography</p>",
      pendingVerification: false,
      ...input
    })
  }

  async position(label, organization, input = {}) {
    return this.create("position", {
      name: this.name(label),
      organization: { uuid: organization.uuid },
      type: "REGULAR",
      role: "MEMBER",
      status: "ACTIVE",
      location: { uuid: HOSPITAL },
      ...input
    })
  }

  async location(label, input = {}) {
    return this.create("location", {
      name: this.name(label),
      type: "POINT_LOCATION",
      status: "ACTIVE",
      lat: 39.89089,
      lng: 32.78224,
      ...input
    })
  }

  async task(label, input = {}) {
    return this.create("task", {
      shortName: this.name(label),
      longName: `${label} fixture task`,
      status: "ACTIVE",
      ...input
    })
  }

  async report(label, input = {}, actor = "arthur") {
    const { me } = await this.api.graphql("{me{uuid}}", {}, actor)
    const report = {
      reportPeople: [
        {
          uuid: me.uuid,
          author: true,
          attendee: false,
          interlocutor: false,
          primary: false
        }
      ],
      intent: this.name(label),
      engagementDate: new Date().toISOString(),
      duration: 60,
      location: { uuid: HOSPITAL },
      reportText: "<p>Fixture report</p>",
      state: "DRAFT",
      ...input
    }
    const data = await this.api.graphql(
      "mutation($report:ReportInput!){createReport(report:$report){uuid}}",
      { report },
      actor
    )
    const entity = { ...report, uuid: data.createReport.uuid }
    return this.own("report", entity)
  }

  async assign(person, position, primary = true) {
    await this.api.graphql(
      "mutation($uuid:String!,$person:PersonInput!,$primary:Boolean!){putPersonInPosition(uuid:$uuid,person:$person,primary:$primary)}",
      { uuid: position.uuid, person: { uuid: person.uuid }, primary }
    )
    person.position = { uuid: position.uuid }
    position.person = { uuid: person.uuid }
  }

  async adminToken() {
    if (
      !this.keycloakAdmin ||
      this.keycloakAdmin.expires <= Date.now() + 30000
    ) {
      const response = await this.api.request.post(
        `${keycloakURL}/realms/master/protocol/openid-connect/token`,
        {
          form: {
            client_id: "admin-cli",
            username: process.env.TEST_KEYCLOAK_ADMIN || "admin",
            password: process.env.TEST_KEYCLOAK_ADMIN_PASSWORD || "admin",
            grant_type: "password"
          }
        }
      )
      if (!response.ok())
        throw new Error(
          `Keycloak fixture administrator authentication: HTTP ${response.status()}`
        )
      const token = await response.json()
      if (!token.access_token)
        throw new Error("Missing Keycloak fixture administrator token")
      this.keycloakAdmin = {
        value: token.access_token,
        expires: Date.now() + token.expires_in * 1000
      }
    }
    return this.keycloakAdmin.value
  }

  async identity(
    label,
    { firstName = label, lastName = this.namespace, email } = {}
  ) {
    const username = `${this.namespace}-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`
    const response = await this.api.request.post(
      `${keycloakURL}/admin/realms/${realm}/users`,
      {
        headers: { Authorization: `Bearer ${await this.adminToken()}` },
        data: {
          username,
          enabled: true,
          firstName,
          lastName,
          email: email || `${username}@example.test`,
          emailVerified: true,
          credentials: [{ type: "password", value: username, temporary: false }]
        }
      }
    )
    if (response.status() !== 201)
      throw new Error(
        `Cannot create fixture identity ${username}: HTTP ${response.status()}`
      )
    const id = response.headers().location.split("/").pop()
    this.identities.push(id)
    return {
      username,
      password: username,
      firstName,
      lastName,
      email: email || `${username}@example.test`
    }
  }

  async actor(
    label,
    organization,
    {
      type = "REGULAR",
      superuserType = "REGULAR",
      administrates = [],
      ...input
    } = {}
  ) {
    const identity = await this.identity(label)
    const { username } = identity
    const person = await this.person(label, {
      user: true,
      users: [{ domainUsername: username }],
      ...input
    })
    const position = await this.position(`${label} position`, organization, {
      type,
      ...(type === "SUPERUSER"
        ? {
            superuserType,
            organizationsAdministrated: administrates.map(org => ({
              uuid: org.uuid
            }))
          }
        : {})
    })
    await this.assign(person, position)
    if (type === "SUPERUSER")
      await this.update("position", position, {
        organizationsAdministrated: administrates.map(org => ({
          uuid: org.uuid
        }))
      })
    return {
      ...identity,
      person,
      position,
      fullName: `${person.rank} ${person.givenName} ${person.familyName}`
    }
  }

  async close() {
    const errors = []
    // Archiving positions releases their occupants. Empty positions are valid.
    // Normal people cannot be deleted through the public API, so archive them.
    for (const { kind, entity } of [...this.resources].reverse()) {
      try {
        if (kind === "report") {
          await this.api
            .graphql("mutation($uuid:String!){deleteReport(uuid:$uuid)}", {
              uuid: entity.uuid
            })
            .catch(error => {
              if (error.status !== 404) throw error
            })
        } else {
          await this.update(kind, entity, { status: "INACTIVE" })
        }
      } catch (error) {
        errors.push(error)
      }
    }
    for (const id of this.identities) {
      try {
        const response = await this.api.request.delete(
          `${keycloakURL}/admin/realms/${realm}/users/${id}`,
          { headers: { Authorization: `Bearer ${await this.adminToken()}` } }
        )
        if (!response.ok() && response.status() !== 404)
          throw new Error(
            `Cannot delete fixture identity: HTTP ${response.status()}`
          )
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length)
      throw new AggregateError(errors, "Fixture cleanup failed")
    this.resources = []
    this.identities = []
  }
}
