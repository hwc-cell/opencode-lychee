import { EOL } from "os"
import { cmd } from "../cmd"
import { d } from "../../i18n"

export const StartupCommand = cmd({
  command: "startup",
  describe: d("print startup timing"),
  builder: (yargs) => yargs,
  handler() {
    process.stdout.write(performance.now().toString() + EOL)
  },
})
