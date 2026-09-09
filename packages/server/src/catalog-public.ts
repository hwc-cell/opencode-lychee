import type { ModelV2 } from "@opencode-ai/core/model"
import type { ProviderV2 } from "@opencode-ai/core/provider"

const secret = /^(?:(?:x[-_])?api[-_]?key|authorization|token|access[-_]?token|secret)$/i

function publicRecord<T>(value: Record<string, T> | undefined): Record<string, T> | undefined {
  if (!value) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !secret.test(key)))
}

function publicRequest(request: ProviderV2.Request): ProviderV2.Request {
  return {
    ...request,
    headers: publicRecord(request.headers) ?? {},
    body: publicRecord(request.body) ?? {},
  }
}

export function publicProvider(provider: ProviderV2.Info): ProviderV2.Info {
  return {
    ...provider,
    api: {
      ...provider.api,
      settings: publicRecord(provider.api.settings) ?? {},
    },
    request: publicRequest(provider.request),
  }
}

export function publicModel(model: ModelV2.Info): ModelV2.Info {
  return {
    ...model,
    api: {
      ...model.api,
      settings: publicRecord(model.api.settings) ?? {},
    },
    request: publicRequest(model.request),
    variants: model.variants.map((variant) => ({ ...variant, ...publicRequest(variant) })),
  }
}
