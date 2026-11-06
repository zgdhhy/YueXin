# Reading font assets

The site ships two subsets of the installed Noto SC variable fonts under the SIL Open Font License 1.1. No runtime font service or network download is required.

| Asset | Source | Weights | Coverage |
| --- | --- | --- | --- |
| reading-sans.woff2 | NotoSansSC-VF.ttf | 400–600 variable | GB2312 Chinese, Latin, punctuation |
| reading-display.woff2 | NotoSerifSC-VF.ttf | 600 | GB2312 Chinese, Latin, punctuation |

Original font metadata is preserved in the adjacent `*-LICENSE.txt` files; complete licenses are included as `NotoSansSC-OFL.txt` and `NotoSerifSC-OFL.txt`, sourced from the corresponding Google Fonts repositories. CSS aliases distinguish their roles. Characters outside these subsets use the declared system fallbacks.

To rebuild from the repository root, install `fonttools[woff]` and `brotli` in a Python environment and run:

```sh
python scripts/build-reading-fonts.py --source-dir /path/to/noto-sc-ttfs
```

Production builds use the checked-in WOFF2 files directly.
