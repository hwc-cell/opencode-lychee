import { runWeixinBridge } from "../../src/weixin/bridge"
import { offerWeixinFile, offerWeixinSession } from "../../src/weixin/offers"

const directory = process.env.LYCHEE_FIXTURE_DIRECTORY!
const artifacts = process.env.LYCHEE_FIXTURE_ARTIFACTS
if (artifacts) {
  const code = offerWeixinSession({ id: "ses_desktop", directory: artifacts })
  const file = await offerWeixinFile(`${artifacts}/report.md`)
  await Bun.write(`${artifacts}/offer-codes.json`, JSON.stringify({ code, file }))
}

await runWeixinBridge({
  serverUrl: process.env.LYCHEE_FIXTURE_SERVER!,
  dir: directory,
  log: (message) => console.log(message),
})
