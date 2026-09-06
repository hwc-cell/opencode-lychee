export * as Catalog from "./catalog"

import { makeLocationNode } from "./effect/app-node"
import { Array, Context, Effect, Layer, Option, Order, pipe, Schema } from "effect"
import { Catalog } from "@opencode-ai/schema/catalog"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Path } from "./global"
import { ModelV2 } from "./model"
import { ProviderV2 } from "./provider"
import { EventV2 } from "./event"
import { Policy } from "./policy"
import { State } from "./state"
import { Integration } from "./integration"

export type ProviderRecord = {
  provider: ProviderV2.MutableInfo
  models: Map<ModelV2.ID, ModelV2.MutableInfo>
}

// ---- 荔枝增强: auth.json 中已配置密钥(api key)的开放平台 -> 注入 v2 目录 ----
type AuthEntry = { type?: string; key?: string }
type AuthFile = Record<string, AuthEntry>

export const AUTH_PROFILES: Record<string, { baseURL: string; models: Array<{ id: string; name: string; variants?: string[] }> }> = {
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", variants: ["low", "medium", "high", "max"] },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", variants: ["low", "medium", "high", "max"] },
    ],
  },
}

function readAuthFile(): AuthFile {
  const file = join(Path.data, "auth.json")
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AuthFile
  } catch {
    return {}
  }
}

// 从 auth.json 生成 auth 平台的 provider 记录(密钥随 provider api.settings 携带)
function authProviderRecords(): ProviderRecord[] {
  const records: ProviderRecord[] = []
  const auth = readAuthFile()
  for (const [providerID, entry] of Object.entries(auth)) {
    const profile = entry?.type === "api" && entry.key ? AUTH_PROFILES[providerID] : undefined
    if (!profile) continue
    const provider = ProviderV2.Info.make({
      id: ProviderV2.ID.make(providerID),
      name: providerID,
      api: {
        type: "aisdk",
        package: "@ai-sdk/openai-compatible",
        url: profile.baseURL,
        settings: { apiKey: entry.key! },
      },
      request: { headers: {}, body: {} },
    })
    const models = new Map<ModelV2.ID, ModelV2.MutableInfo>()
    for (const m of profile.models) {
      const variants = (m.variants ?? []).map((vid) => ({
        id: ModelV2.VariantID.make(vid),
        headers: {},
        body: { reasoningEffort: vid },
      }))
      const model = ModelV2.Info.make({
        id: ModelV2.ID.make(m.id),
        providerID: ProviderV2.ID.make(providerID),
        name: m.name,
        api: { type: "aisdk", package: "@ai-sdk/openai-compatible", id: ModelV2.ID.make(m.id) },
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        request: { headers: {}, body: {} },
        variants,
        time: { released: Date.now() },
        cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }],
        status: "active",
        enabled: true,
        limit: { context: 128_000, output: 16_000 },
      })
      models.set(ModelV2.ID.make(m.id), model as ModelV2.MutableInfo)
    }
    records.push({ provider, models })
  }
  return records
}

export type DefaultModel = { providerID: ProviderV2.ID; modelID: ModelV2.ID }

export const PolicyActions = Schema.Literals(["provider.use"])

export const Event = Catalog.Event

type Data = {
  providers: Map<ProviderV2.ID, ProviderRecord>
  defaultModel?: DefaultModel
}

export type Draft = {
  provider: {
    list: () => readonly ProviderRecord[]
    get: (providerID: ProviderV2.ID) => ProviderRecord | undefined
    update: (providerID: ProviderV2.ID, fn: (provider: ProviderV2.MutableInfo) => void) => void
    remove: (providerID: ProviderV2.ID) => void
  }
  model: {
    get: (providerID: ProviderV2.ID, modelID: ModelV2.ID) => ModelV2.Info | undefined
    update: (providerID: ProviderV2.ID, modelID: ModelV2.ID, fn: (model: ModelV2.MutableInfo) => void) => void
    remove: (providerID: ProviderV2.ID, modelID: ModelV2.ID) => void
    default: {
      get: () => DefaultModel | undefined
      set: (providerID: ProviderV2.ID, modelID: ModelV2.ID) => void
    }
  }
}

export interface Interface extends State.Transformable<Draft> {
  readonly provider: {
    readonly get: (providerID: ProviderV2.ID) => Effect.Effect<ProviderV2.Info | undefined>
    readonly all: () => Effect.Effect<ProviderV2.Info[]>
    readonly available: () => Effect.Effect<ProviderV2.Info[]>
  }
  readonly model: {
    readonly get: (providerID: ProviderV2.ID, modelID: ModelV2.ID) => Effect.Effect<ModelV2.Info | undefined>
    readonly all: () => Effect.Effect<ModelV2.Info[]>
    readonly available: () => Effect.Effect<ModelV2.Info[]>
    readonly default: () => Effect.Effect<ModelV2.Info | undefined>
    readonly small: (providerID: ProviderV2.ID) => Effect.Effect<ModelV2.Info | undefined>
  }
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Catalog") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const policy = yield* Policy.Service
    const integrations = yield* Integration.Service

    const available = (provider: ProviderV2.Info, integration: Integration.Info | undefined) => {
      if (provider.disabled) return false
      if (typeof provider.request.body.apiKey === "string") return true
      if (integration?.connections.length) return true
      return provider.integrationID === undefined && !integration
    }

    const projectModel = (model: ModelV2.Info, provider: ProviderV2.Info) => {
      const api =
        model.api.type === "native" && !model.api.url && Object.keys(model.api.settings).length === 0
          ? { ...provider.api, id: model.api.id }
          : model.api.type === "aisdk" && provider.api.type === "aisdk" && !model.api.url
            ? { ...model.api, url: provider.api.url, settings: { ...provider.api.settings, ...model.api.settings } }
            : model.api.type === "aisdk" && provider.api.type === "aisdk"
              ? { ...model.api, settings: { ...provider.api.settings, ...model.api.settings } }
              : model.api
      const request = {
        headers: { ...provider.request.headers, ...model.request.headers },
        body: { ...provider.request.body, ...model.request.body },
        variant: model.request.variant,
      }
      return ModelV2.Info.make({
        ...model,
        api,
        request,
      })
    }

    const normalizeApi = (item: ProviderV2.MutableInfo | ModelV2.MutableInfo) => {
      if (typeof item.request.body.baseURL !== "string") return
      item.api.url = item.request.body.baseURL
      delete item.request.body.baseURL
    }

    const state = State.create<Data, Draft>({
      initial: () => ({ providers: new Map() }),
      draft: (draft) => {
        const result: Draft = {
          provider: {
            list: () => Array.fromIterable(draft.providers.values()) as ProviderRecord[],
            get: (providerID) => draft.providers.get(providerID),
            update: (providerID, fn) => {
              let current = draft.providers.get(providerID)
              if (!current) {
                current = {
                  provider: ProviderV2.Info.empty(providerID) as ProviderV2.MutableInfo,
                  models: new Map<ModelV2.ID, ModelV2.MutableInfo>(),
                }
                draft.providers.set(providerID, current)
              }
              fn(current.provider)
              normalizeApi(current.provider)
            },
            remove: (providerID) => {
              draft.providers.delete(providerID)
            },
          },
          model: {
            get: (providerID, modelID) => draft.providers.get(providerID)?.models.get(modelID),
            update: (providerID, modelID, fn) => {
              let record = draft.providers.get(providerID)
              if (!record) {
                record = {
                  provider: ProviderV2.Info.empty(providerID) as ProviderV2.MutableInfo,
                  models: new Map<ModelV2.ID, ModelV2.MutableInfo>(),
                }
                draft.providers.set(providerID, record)
              }
              const model =
                record.models.get(modelID) ?? (ModelV2.Info.empty(providerID, modelID) as ModelV2.MutableInfo)
              if (!record.models.has(modelID)) record.models.set(modelID, model)
              fn(model)
              model.id = modelID
              model.providerID = providerID
              normalizeApi(model)
            },
            remove: (providerID, modelID) => {
              draft.providers.get(providerID)?.models.delete(modelID)
            },
            default: {
              get: () => draft.defaultModel,
              set: (providerID, modelID) => {
                draft.defaultModel = { providerID, modelID }
              },
            },
          },
        }
        return result
      },
      finalize: Effect.fn("CatalogV2.finalize")(function* (catalog) {
        if (policy.hasStatements()) {
          for (const record of [...catalog.provider.list()]) {
            if ((yield* policy.evaluate("provider.use", record.provider.id, "allow")) === "deny") {
              catalog.provider.remove(record.provider.id)
            }
          }
        }
        yield* events.publish(Event.Updated, {})
      }),
    })
    const result: Interface = {
      transform: state.transform,
      reload: state.reload,

      provider: {
        get: Effect.fn("CatalogV2.provider.get")(function* (providerID) {
          const record = state.get().providers.get(providerID)
          if (record) return record.provider
          // 荔枝: auth.json 密钥平台回退
          return authProviderRecords().find((item) => item.provider.id === providerID)?.provider
        }),

        all: Effect.fn("CatalogV2.provider.all")(function* () {
          const records = authProviderRecords()
          const known = new Set(state.get().providers.keys())
          return Array.fromIterable(state.get().providers.values())
            .map((record) => record.provider)
            .concat(records.filter((record) => !known.has(record.provider.id)).map((record) => record.provider))
        }),

        available: Effect.fn("CatalogV2.provider.available")(function* () {
          const active = new Map((yield* integrations.list()).map((integration) => [integration.id, integration]))
          return (yield* result.provider.all()).filter((provider) =>
            available(provider, active.get(provider.integrationID ?? Integration.ID.make(provider.id))),
          )
        }),
      },

      model: {
        get: Effect.fn("CatalogV2.model.get")(function* (providerID, modelID) {
          const record = state.get().providers.get(providerID)
          if (!record) {
            // 荔枝: auth.json 密钥平台回退
            const auth = authProviderRecords().find((item) => item.provider.id === providerID)
            const model = auth?.models.get(modelID)
            return model && auth ? projectModel(model, auth.provider) : undefined
          }
          const model = record.models.get(modelID)
          return model && projectModel(model, record.provider)
        }),

        all: Effect.fn("CatalogV2.model.all")(function* () {
          const authModels = authProviderRecords().flatMap((record) =>
            Array.fromIterable(record.models.values()).map((model) => projectModel(model, record.provider)),
          )
          const authIDs = new Set(authProviderRecords().map((record) => record.provider.id))
          return authModels.concat(
            pipe(
            Array.fromIterable(state.get().providers.values()),
            Array.flatMap((record) => {
              return Array.fromIterable(record.models.values()).map((model) => projectModel(model, record.provider))
            }),
            Array.sortWith((item) => item.time.released, Order.flip(Order.Number)),
          ).filter((item) => !authIDs.has(item.providerID)),
          )
        }),

        available: Effect.fn("CatalogV2.model.available")(function* () {
          const providers = new Set((yield* result.provider.available()).map((provider) => provider.id))
          // 荔枝: auth.json 密钥平台的模型视为可用
          for (const record of authProviderRecords()) providers.add(record.provider.id)
          return (yield* result.model.all()).filter((model) => providers.has(model.providerID) && model.enabled)
        }),

        default: Effect.fn("CatalogV2.model.default")(function* () {
          const defaultModel = state.get().defaultModel
          if (defaultModel) {
            const provider = yield* result.provider.get(defaultModel.providerID)
            if (provider && (yield* result.provider.available()).some((item) => item.id === provider.id)) {
              const model = yield* result.model.get(defaultModel.providerID, defaultModel.modelID)
              if (model?.enabled) return model
            }
          }

          return Option.getOrUndefined(
            pipe(
              yield* result.model.available(),
              Array.sortWith((item) => item.time.released, Order.flip(Order.Number)),
              Array.head,
            ),
          )
        }),

        small: Effect.fn("CatalogV2.model.small")(function* (providerID) {
          const record = state.get().providers.get(providerID)
          if (!record) return
          const provider = record.provider

          // TODO: Remove these provider-specific assumptions once model syncing reliably reports available deployments.
          if (providerID === ProviderV2.ID.azure || providerID === ProviderV2.ID.make("azure-cognitive-services")) {
            return
          }

          if (providerID === ProviderV2.ID.opencode) {
            const gpt5Nano = record.models.get(ModelV2.ID.make("gpt-5-nano"))
            if (gpt5Nano?.enabled && gpt5Nano.status === "active") return projectModel(gpt5Nano, provider)
          }

          const candidates = pipe(
            Array.fromIterable(record.models.values()),
            Array.filter(
              (model) =>
                model.providerID === providerID &&
                model.enabled &&
                model.status === "active" &&
                model.capabilities.input.some((item) => item.startsWith("text")) &&
                model.capabilities.output.some((item) => item.startsWith("text")),
            ),
            Array.map((model) => ({
              model,
              cost: model.cost[0] ? model.cost[0].input + model.cost[0].output : 999,
              age: (Date.now() - model.time.released) / (1000 * 60 * 60 * 24 * 30),
              small: SMALL_MODEL_RE.test(`${model.id} ${model.family ?? ""} ${model.name}`.toLowerCase()),
            })),
            Array.filter((item) => item.cost > 0 && item.age <= 18),
          )

          const pick = (items: typeof candidates) => {
            const maxCost = Math.max(...items.map((item) => item.cost), 0.01)
            const maxAge = Math.max(...items.map((item) => item.age), 0.01)
            return pipe(
              items,
              Array.sortWith((item) => (item.cost / maxCost) * 0.8 + (item.age / maxAge) * 0.2, Order.Number),
              Array.map((item) => projectModel(item.model, provider)),
              Array.head,
            )
          }

          return Option.getOrUndefined(
            pipe(
              candidates,
              Array.filter((item) => item.small),
              (items) => (items.length > 0 ? pick(items) : pick(candidates)),
            ),
          )
        }),
      },
    }

    return Service.of(result)
  }),
)

const SMALL_MODEL_RE = /\b(nano|flash|lite|mini|haiku|small|fast)\b/

export const locationLayer = layer.pipe(
  Layer.provideMerge(Integration.locationLayer),
  Layer.provideMerge(Policy.locationLayer),
)

export const node = makeLocationNode({ service: Service, layer, deps: [EventV2.node, Policy.node, Integration.node] })
