import { describe, expect, test } from "bun:test"
import type { ModelV2 } from "@opencode-ai/core/model"
import type { ProviderV2 } from "@opencode-ai/core/provider"
import { publicModel, publicProvider } from "../src/catalog-public"

describe("public catalog", () => {
  test("removes credentials from providers", () => {
    const provider = {
      id: "test",
      name: "test",
      api: { type: "aisdk", package: "test", settings: { apiKey: "secret", region: "cn" } },
      request: {
        headers: { Authorization: "Bearer secret", Accept: "application/json" },
        body: { token: "secret", mode: "fast" },
      },
    } as unknown as ProviderV2.Info

    expect(publicProvider(provider)).toEqual({
      ...provider,
      api: { ...provider.api, settings: { region: "cn" } },
      request: { headers: { Accept: "application/json" }, body: { mode: "fast" } },
    })
    expect(provider.api.settings).toEqual({ apiKey: "secret", region: "cn" })
  })

  test("removes credentials from models and variants", () => {
    const model = {
      id: "model",
      providerID: "test",
      name: "model",
      api: { id: "model", type: "native", settings: { api_key: "secret", mode: "fast" } },
      request: { headers: { "X-Api-Key": "secret" }, body: { access_token: "secret", mode: "fast" } },
      variants: [
        {
          id: "high",
          headers: { Authorization: "secret" },
          body: { secret: "value", effort: "high" },
        },
      ],
      capabilities: { tools: false, input: [], output: [] },
      time: { released: 0 },
      cost: [],
      status: "active",
      enabled: true,
      limit: { context: 0, output: 0 },
    } as unknown as ModelV2.Info

    const result = publicModel(model)
    expect(result.api.settings).toEqual({ mode: "fast" })
    expect(result.request).toEqual({ headers: {}, body: { mode: "fast" } })
    expect(result.variants[0]).toEqual({ id: model.variants[0]!.id, headers: {}, body: { effort: "high" } })
  })
})
