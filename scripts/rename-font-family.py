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


def set_name_value(font: TTFont, name_id: int, value: str) -> None:
    records = [record for record in font["name"].names if record.nameID == name_id]
    if not records:
        font["name"].setName(value, name_id, 3, 1, 0x409)
        return
    for record in records:
        record.string = value.encode(record.getEncoding())


def rename_font(source: Path, destination: Path) -> None:
    font = TTFont(source)
    for name_id, value in NAME_VALUES.items():
        set_name_value(font, name_id, value)
    for instance in font["fvar"].instances:
        if instance.postscriptNameID == 0xFFFF:
            continue
        subfamily = font["name"].getDebugName(instance.subfamilyNameID) or "Regular"
        postscript_style = "".join(character for character in subfamily if character.isascii() and character.isalnum())
        set_name_value(font, instance.postscriptNameID, f"VectorGrid-{postscript_style or 'Regular'}")
    font.flavor = "woff2"
    font.save(destination)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: rename-font-family.py SOURCE DESTINATION")
    rename_font(Path(sys.argv[1]), Path(sys.argv[2]))
