import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { summary } from "./weixin/shared"

export default Runtime.handler(Commands.commands.weixin, () => Effect.sync(summary))
