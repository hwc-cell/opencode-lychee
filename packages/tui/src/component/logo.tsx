import { RGBA } from "@opentui/core"
import { For } from "solid-js"
import { icon } from "../logo"
import { useTheme } from "../context/theme"

const palette = Object.fromEntries(
  Object.entries(icon.palette).map(([key, value]) => [
    key,
    RGBA.fromInts(value[0], value[1], value[2]),
  ]),
) as Record<string, RGBA>

export function Logo() {
  const { theme } = useTheme()

  return (
    <box>
      <For each={icon.top}>
        {(topRow, rowIndex) => (
          <box height={1} flexDirection="row">
            <text>
              <For each={Array.from(topRow)}>
                {(ch, colIndex) => {
                  const i = rowIndex()
                  const bottomCh = icon.bottom[i][colIndex()]
                  const top = palette[ch]
                  const bottom = palette[bottomCh]
                  if (top && bottom) {
                    return (
                      <span style={{ fg: top, bg: bottom }}>
                        ▀
                      </span>
                    )
                  }
                  if (top) {
                    return (
                      <span style={{ fg: top, bg: theme.background }}>
                        ▀
                      </span>
                    )
                  }
                  if (bottom) {
                    return (
                      <span style={{ fg: theme.background, bg: bottom }}>
                        ▀
                      </span>
                    )
                  }
                  return <span> </span>
                }}
              </For>
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
