import { Service } from "@opencode/client/effect/service"
import { Effect, Option } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { run } from "./shared"

export default Runtime.handler(
  Commands.commands.weixin.commands.run,
  Effect.fn("cli.weixin.run")(function* (input) {
    const server = yield* ServerConnection.resolve({
      server: Option.getOrUndefined(input.server),
      standalone: input.standalone,
    })
    yield* Effect.promise(() =>
      run({
        serverUrl: server.endpoint.url,
        headers: Service.headers(server.endpoint),
        dir: Option.getOrUndefined(input.dir),
      }),
    )
  }),
)
