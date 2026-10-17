/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { Logo } from "../../src/component/logo"
import { ConfigProvider } from "../../src/config"
import { ThemeProvider } from "../../src/context/theme"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

test.each([
  { width: 80, height: 30, full: true },
  { width: 28, height: 24, full: false },
  { width: 80, height: 16, full: false },
])("shows the Lychee brand at $width x $height", async ({ width, height, full }) => {
  await using temporary = await tmpdir()
  const mounted = Promise.withResolvers<void>()
  function Mark() {
    onMount(mounted.resolve)
    return <Logo />
  }
  const app = await testRender(
    () => (
      <TestTuiContexts paths={{ home: temporary.path, state: temporary.path }}>
        <ConfigProvider config={createTuiResolvedConfig({ animations: false })}>
          <ThemeProvider mode="dark" source={emptyThemeSource}>
            <Mark />
          </ThemeProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width, height, kittyKeyboard: true },
  )
  try {
    await mounted.promise
    await app.renderOnce()
    const lines = app
      .captureCharFrame()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (full) {
      expect(lines[0]).toBe("▀▀▀")
      expect(lines.at(-1)).toBe("lychee")
      expect(lines).toHaveLength(10)
      return
    }
    expect(lines).toEqual(["lychee"])
  } finally {
    app.renderer.destroy()
  }
})
