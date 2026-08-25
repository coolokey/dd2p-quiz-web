"""Rename the user-facing name table entries of the local display font."""

from pathlib import Path
import sys

ROOT = Path(__file__).parents[1]
LOCAL_FONT_BUILD = ROOT / ".tools" / "font-build"
if LOCAL_FONT_BUILD.exists():
    sys.path.insert(0, str(LOCAL_FONT_BUILD))

from fontTools.ttLib import TTFont


NAME_VALUES = {
    1: "VectorGrid",
    3: "2.001;DDP;VectorGrid-Regular",
    4: "VectorGrid Regular",
    6: "VectorGrid-Regular",
    16: "VectorGrid",
    21: "VectorGrid",
    25: "VectorGrid",
}


def rename_font(source: Path, destination: Path) -> None:
    font = TTFont(source)
    for record in font["name"].names:
        value = NAME_VALUES.get(record.nameID)
        if value is not None:
            record.string = value.encode(record.getEncoding())
    font.flavor = "woff2"
    font.save(destination)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: rename-font-family.py SOURCE DESTINATION")
    rename_font(Path(sys.argv[1]), Path(sys.argv[2]))
