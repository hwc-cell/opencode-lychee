export const logo = {
  left: [
    "",
    "      ▄                  ▄",
    "      █                  █",
    "      █    █   █  ▄▀▀▀▄  █▀▀▀▄",
    "      █    █   █  █      █   █",
    "      █▄   ▀▄▄▄█  ▀▄▄▄▀  █   █",
    "           ▄   █",
    "            ▀▀▀",
  ],
  right: [
    "",
    "",
    "",
    "█▀▀ ▄  █▀▀ ▄",
    "█▀▀▀▀  █▀▀▀▀",
    "▀▄▄▄▀  ▀▄▄▄▀",
    "",
    "",
  ],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"

// Lychee icon pixel art, quantized from the brand image.
// Each text row is rendered as half blocks: `top` colors the upper half,
// `bottom` colors the lower half; "." is transparent.
const iconPalette: Record<string, [number, number, number]> = {
  r: [232, 76, 70],
  R: [198, 52, 46],
  d: [160, 38, 34],
  l: [250, 140, 126],
  w: [255, 228, 216],
  g: [126, 176, 60],
  G: [86, 134, 40],
}

export const icon = {
  size: { width: 32, rows: 13 },
  palette: iconPalette,
  top: [
    "................................",
    "................................",
    "...................gg...........",
    "...........rrrrrrggR............",
    "........rrlllrrrrrrrrrrR........",
    ".......rrrrrrrrrrrrrrrrRrR......",
    "......rrrrrrrrrrrrrrrrrrrR......",
    "......rrrrrrrrrrrrrrrrrRrR......",
    ".......rrrrrrrrrrrrrrrRRr.......",
    "........rrrrrrrrrrrRRRrR........",
    "..........rrrrRRrrrrrR..........",
    "................................",
    "................................",
  ],
  bottom: [
    "................................",
    "................................",
    "..................gg............",
    ".........rrllrrrrrRrrrR.........",
    ".......rrrrrrrrrrrrrrrrrr.......",
    "......rrrrrrrrrrrrrrrrrrrR......",
    "......rrrrrrrrrrrrrrrrrRRr......",
    "......rrrrrrrrrrrrrrrrRRrR......",
    ".......rrrrrrrrrrrrrrrrrR.......",
    ".........rrrrrrrrrRrrrR.........",
    "............RRrrRRR.............",
    "................................",
    "................................",
  ],
}
