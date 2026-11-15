import { runWeixinBridge } from "../../src/weixin/bridge"

await runWeixinBridge({
  serverUrl: process.env.LYCHEE_FIXTURE_SERVER!,
  dir: process.env.LYCHEE_FIXTURE_DIRECTORY!,
  log: (message) => console.log(message),
})
