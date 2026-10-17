import { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { lycheeIcon } from "../logo"

const palette = new Map(Object.entries(lycheeIcon.palette).map(([key, rgb]) => [key, RGBA.fromInts(...rgb)]))

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const full = () => dimensions().width >= 36 && dimensions().height >= 24

  return (
    <Show when={dimensions().height >= 12}>
      <box alignItems="center" flexShrink={0}>
        <Show when={full()}>
          <For each={lycheeIcon.top}>
            {(row, index) => (
              <text height={1} selectable={false}>
                <For each={Array.from(row)}>
                  {(pixel, column) => {
                    const top = palette.get(pixel)
                    const bottom = palette.get(lycheeIcon.bottom[index()][column()])
                    if (!top && !bottom) return <span> </span>
                    return (
                      <span style={{ fg: top ?? theme.background.base, bg: bottom ?? theme.background.base }}>▀</span>
                    )
                  }}
                </For>
              </text>
            )}
          </For>
        </Show>
        <text fg={theme.text.base} selectable={false}>
          lychee
        </text>
      </box>
    </Show>
  )
}
