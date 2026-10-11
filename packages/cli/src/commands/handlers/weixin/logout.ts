import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { logout } from "./shared"

export default Runtime.handler(Commands.commands.weixin.commands.logout, () => Effect.sync(logout))
