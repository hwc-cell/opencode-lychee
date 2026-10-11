type Colors = {
  background: string
  panel: string
  element: string
  borderSubtle: string
  border: string
  borderActive: string
  text: string
  muted: string
  primary: string
  secondary: string
  accent: string
  error: string
  warning: string
  success: string
  info: string
  diffAddedBg: string
  diffRemovedBg: string
  diffAddedLineNumberBg: string
  diffRemovedLineNumberBg: string
}

type Palette = { dark: Colors; light: Colors }

const pair = (name: keyof Colors) => ({
  dark: `dark${name[0]!.toUpperCase()}${name.slice(1)}`,
  light: `light${name[0]!.toUpperCase()}${name.slice(1)}`,
})

function makeTheme(palette: Palette) {
  const defs = Object.fromEntries(
    (Object.keys(palette.dark) as Array<keyof Colors>).flatMap((name) => [
      [`dark${name[0]!.toUpperCase()}${name.slice(1)}`, palette.dark[name]],
      [`light${name[0]!.toUpperCase()}${name.slice(1)}`, palette.light[name]],
    ]),
  )
  return {
    $schema: "https://opencode.ai/theme.json",
    defs,
    theme: {
      primary: pair("primary"),
      secondary: pair("secondary"),
      accent: pair("accent"),
      error: pair("error"),
      warning: pair("warning"),
      success: pair("success"),
      info: pair("info"),
      text: pair("text"),
      textMuted: pair("muted"),
      selectedListItemText: { dark: "darkBackground", light: "#FFFFFF" },
      background: pair("background"),
      backgroundPanel: pair("panel"),
      backgroundElement: pair("element"),
      backgroundMenu: pair("element"),
      border: pair("border"),
      borderActive: pair("borderActive"),
      borderSubtle: pair("borderSubtle"),
      diffAdded: pair("success"),
      diffRemoved: pair("error"),
      diffContext: pair("muted"),
      diffHunkHeader: pair("info"),
      diffHighlightAdded: pair("success"),
      diffHighlightRemoved: pair("error"),
      diffAddedBg: pair("diffAddedBg"),
      diffRemovedBg: pair("diffRemovedBg"),
      diffContextBg: pair("panel"),
      diffLineNumber: pair("muted"),
      diffAddedLineNumberBg: pair("diffAddedLineNumberBg"),
      diffRemovedLineNumberBg: pair("diffRemovedLineNumberBg"),
      markdownText: pair("text"),
      markdownHeading: pair("primary"),
      markdownLink: pair("primary"),
      markdownLinkText: pair("info"),
      markdownCode: pair("success"),
      markdownBlockQuote: pair("muted"),
      markdownEmph: pair("warning"),
      markdownStrong: pair("accent"),
      markdownHorizontalRule: pair("border"),
      markdownListItem: pair("primary"),
      markdownListEnumeration: pair("info"),
      markdownImage: pair("primary"),
      markdownImageText: pair("info"),
      markdownCodeBlock: pair("text"),
      syntaxComment: pair("muted"),
      syntaxKeyword: pair("accent"),
      syntaxFunction: pair("primary"),
      syntaxVariable: pair("secondary"),
      syntaxString: pair("success"),
      syntaxNumber: pair("warning"),
      syntaxType: pair("warning"),
      syntaxOperator: pair("info"),
      syntaxPunctuation: pair("text"),
    },
  }
}

export const lycheeOsmanthusMoon = makeTheme({
  dark: {
    background: "#111827",
    panel: "#1B2433",
    element: "#263044",
    borderSubtle: "#303B50",
    border: "#39465C",
    borderActive: "#6E7790",
    text: "#F4E9C9",
    muted: "#AEA48F",
    primary: "#D6A84B",
    secondary: "#E85D68",
    accent: "#E85D68",
    error: "#F0717D",
    warning: "#D6A84B",
    success: "#6FA184",
    info: "#87A9C6",
    diffAddedBg: "#1D352C",
    diffRemovedBg: "#42252B",
    diffAddedLineNumberBg: "#274638",
    diffRemovedLineNumberBg: "#563038",
  },
  light: {
    background: "#FCF8EC",
    panel: "#F3EAD3",
    element: "#E9DDBE",
    borderSubtle: "#E5D8B8",
    border: "#D7C59A",
    borderActive: "#AA8B4E",
    text: "#332D24",
    muted: "#716856",
    primary: "#8A5B12",
    secondary: "#B83E4D",
    accent: "#B83E4D",
    error: "#B83E4D",
    warning: "#8A5B12",
    success: "#49735F",
    info: "#4C6E87",
    diffAddedBg: "#E0EEE5",
    diffRemovedBg: "#F6DFE1",
    diffAddedLineNumberBg: "#D1E4D8",
    diffRemovedLineNumberBg: "#EECFD3",
  },
})

export const lycheeChinaRed = makeTheme({
  dark: {
    background: "#191313",
    panel: "#251A1B",
    element: "#332224",
    borderSubtle: "#432E31",
    border: "#594044",
    borderActive: "#8A5A60",
    text: "#F6E9DD",
    muted: "#B5A094",
    primary: "#F05A63",
    secondary: "#6FA083",
    accent: "#D6A348",
    error: "#F05A63",
    warning: "#D6A348",
    success: "#6FA083",
    info: "#8FAAB8",
    diffAddedBg: "#20372D",
    diffRemovedBg: "#462326",
    diffAddedLineNumberBg: "#2B493A",
    diffRemovedLineNumberBg: "#5B2C31",
  },
  light: {
    background: "#FFF8F3",
    panel: "#F7E9DE",
    element: "#EFDBCE",
    borderSubtle: "#E8CFC1",
    border: "#D9B9AA",
    borderActive: "#B77E72",
    text: "#382A26",
    muted: "#765E56",
    primary: "#B4232F",
    secondary: "#47745E",
    accent: "#94610F",
    error: "#B4232F",
    warning: "#94610F",
    success: "#47745E",
    info: "#4E7080",
    diffAddedBg: "#DFEEE5",
    diffRemovedBg: "#F7DDDF",
    diffAddedLineNumberBg: "#CEE2D6",
    diffRemovedLineNumberBg: "#EFCBCD",
  },
})

export const lycheeCeladon = makeTheme({
  dark: {
    background: "#0F1B19",
    panel: "#162825",
    element: "#1E3631",
    borderSubtle: "#29433D",
    border: "#36554D",
    borderActive: "#618378",
    text: "#DCEFE8",
    muted: "#91AEA5",
    primary: "#69B09E",
    secondary: "#F0707B",
    accent: "#F0707B",
    error: "#F0707B",
    warning: "#D2AA55",
    success: "#6BB68C",
    info: "#78B7B1",
    diffAddedBg: "#17362A",
    diffRemovedBg: "#40252A",
    diffAddedLineNumberBg: "#204838",
    diffRemovedLineNumberBg: "#542E35",
  },
  light: {
    background: "#F5FAF8",
    panel: "#E8F3EF",
    element: "#DCEAE5",
    borderSubtle: "#D3E5DF",
    border: "#BFD8D0",
    borderActive: "#85B1A5",
    text: "#183B35",
    muted: "#5B756D",
    primary: "#397D6D",
    secondary: "#B83E4D",
    accent: "#B83E4D",
    error: "#B83E4D",
    warning: "#856020",
    success: "#397D6D",
    info: "#397675",
    diffAddedBg: "#DCEFE5",
    diffRemovedBg: "#F5DFE2",
    diffAddedLineNumberBg: "#CBE4D6",
    diffRemovedLineNumberBg: "#ECCED3",
  },
})
