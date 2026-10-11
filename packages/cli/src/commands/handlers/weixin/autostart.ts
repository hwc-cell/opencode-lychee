import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { autostart } from "./shared"

export default Runtime.handler(Commands.commands.weixin.commands.autostart, () => Effect.sync(autostart))
