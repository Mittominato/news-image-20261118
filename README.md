# Wednesday 18 November 2026 — the world in one image

[![news-image-20261118](https://make.fun/badge/news-image-20261118.svg)](https://make.fun/c/news-image-20261118)
[![rank](https://make.fun/badge/news-image-20261118/Mittominato/news-image-20261118/rank.svg)](https://make.fun/c/news-image-20261118)
[![reward](https://make.fun/badge/news-image-20261118/Mittominato/news-image-20261118/reward.svg)](https://make.fun/c/news-image-20261118)

An entry for the make.fun **news-image-20261118** bounty
("Sum up 18 November's world news in one image"):
https://make.fun/bounty/news-image-20261118

`main.ts` is a drawing program — it renders a one-page news infographic for
Wednesday 18 November 2026 and writes it to `/output/entry.png`. No network,
no clock, no randomness: both runs write identical bytes.

## What the image shows

A date banner — **WEDNESDAY 18 NOVEMBER 2026** — above six stories verified
from Reuters, AP and IMD reporting of that day:

1. **US–Iran strikes spread** — Bahrain intercepts Iranian drones; the US hit
   a launch site on Qeshm Island.
2. **APEC opens in Shenzhen** — 21 economies gather in China; Trump in
   Manila for Quad talks.
3. **Ukraine hits the Crimea bridge again** — a second day of strikes as
   Russia pounds bridges around Kyiv.
4. **Cyclone Akvan nears India** — the storm over the Bay of Bengal is set to
   strengthen; Andhra Pradesh on alert.
5. **Nvidia's $116bn quarter lifts Asia** — the chipmaker's sales doubled;
   stocks snapped a four-day slide.
6. **Estonia to shut the Russia border** — crossings close in December after
   an attack bid on a defence firm.

## How it is drawn

`main.ts` holds everything it needs: a hand-written PNG encoder (CRC32 +
`node:zlib` deflate), a small RGB framebuffer with line/circle/arc/triangle
primitives, an embedded 5×7 bitmap font, six drawn icons (drone, globe,
bridge, cyclone, chip, border gate) and a layout engine that renders the
infographic from the embedded news data. Node standard library only.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024 PNG, well under 1 MiB). Run it twice:
the two files are byte-identical.
