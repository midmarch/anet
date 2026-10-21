import { request } from "@playwright/test"
import { keycloakURL, realm, serverURL } from "./auth.js"

export class TestApi {
  constructor() {
    this.tokens = new Map()
  }

  async start() {
    this.request = await request.newContext({ ignoreHTTPSErrors: true })
    return this
  }

  async token(actor = "arthur") {
    const { username, password = username } =
      typeof actor === "string" ? { username: actor } : actor
    const cached = this.tokens.get(username)
    if (cached && cached.expires > Date.now() + 30000) return cached.value
    const response = await this.request.post(
      `${keycloakURL}/realms/${realm}/protocol/openid-connect/token`,
      {
        form: {
          client_id: "ANET-Client-public",
          username,
          password,
          grant_type: "password"
        }
      }
    )
    if (!response.ok())
      throw new Error(
        `Authentication failed for test actor ${username}: HTTP ${response.status()}`
      )
    const token = await response.json()
    if (!token.access_token)
      throw new Error(`Missing access token for test actor ${username}`)
    this.tokens.set(username, {
      value: token.access_token,
      expires: Date.now() + token.expires_in * 1000
    })
    return token.access_token
  }

  async graphql(query, variables = {}, actor = "arthur") {
    const response = await this.request.post(`${serverURL}/graphql`, {
      headers: { Authorization: `Bearer ${await this.token(actor)}` },
      data: { query, variables }
    })
    const body = await response.json()
    if (!response.ok()) {
      const error = new Error(
        `Fixture GraphQL request failed: HTTP ${response.status()}: ${body.message || body.errors?.map(error => error.message).join("; ") || JSON.stringify(body)}`
      )
      error.status = response.status()
      throw error
    }
    if (body.errors?.length)
      throw new Error(body.errors.map(error => error.message).join("; "))
    return body.data
  }

  async close() {
    await this.request.dispose()
  }
}
