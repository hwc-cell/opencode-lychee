import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { autostop } from "./shared"

export default Runtime.handler(Commands.commands.weixin.commands.autostop, () => Effect.sync(autostop))
