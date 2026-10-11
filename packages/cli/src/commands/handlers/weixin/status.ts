import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { status } from "./shared"

export default Runtime.handler(Commands.commands.weixin.commands.status, () => Effect.sync(status))
