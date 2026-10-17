export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

// Original Lychee pixel mark, restored from the fork's pre-v2 branding.
// Each terminal cell combines an upper and lower pixel; dots are transparent.
export const lycheeIcon = {
  palette: {
    r: [232, 76, 70],
    R: [198, 52, 46],
    l: [250, 140, 126],
    g: [126, 176, 60],
  },
  top: [
    "...................gg...........",
    "...........rrrrrrggR............",
    "........rrlllrrrrrrrrrrR........",
    ".......rrrrrrrrrrrrrrrrRrR......",
    "......rrrrrrrrrrrrrrrrrrrR......",
    "......rrrrrrrrrrrrrrrrrRrR......",
    ".......rrrrrrrrrrrrrrrRRr.......",
    "........rrrrrrrrrrrRRRrR........",
    "..........rrrrRRrrrrrR..........",
  ],
  bottom: [
    "..................gg............",
    ".........rrllrrrrrRrrrR.........",
    ".......rrrrrrrrrrrrrrrrrr.......",
    "......rrrrrrrrrrrrrrrrrrrR......",
    "......rrrrrrrrrrrrrrrrrRRr......",
    "......rrrrrrrrrrrrrrrrRRrR......",
    ".......rrrrrrrrrrrrrrrrrR.......",
    ".........rrrrrrrrrRrrrR.........",
    "............RRrrRRR.............",
  ],
} satisfies { palette: Record<string, [number, number, number]>; top: string[]; bottom: string[] }
