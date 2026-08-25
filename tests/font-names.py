from pathlib import Path
import sys

ROOT = Path(__file__).parents[1]
LOCAL_FONT_BUILD = ROOT / ".tools" / "font-build"
if LOCAL_FONT_BUILD.exists():
    sys.path.insert(0, str(LOCAL_FONT_BUILD))

from fontTools.ttLib import TTFont


FONT_PATH = ROOT / "web" / "assets" / "fonts" / "VectorGrid-Variable.woff2"
KEY_NAME_IDS = {1, 3, 4, 6, 16, 21, 25}


def main() -> None:
    font = TTFont(FONT_PATH)
    names = [
        record.toUnicode()
        for record in font["name"].names
        if record.nameID in KEY_NAME_IDS
    ]
    assert names, "VectorGrid 字型應包含關鍵 name table 記錄"
    assert all("Orbitron" not in name for name in names), names
    assert any("VectorGrid" in name for name in names), names
    print(names)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise
