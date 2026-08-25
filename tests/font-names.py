from pathlib import Path
import sys

ROOT = Path(__file__).parents[1]
LOCAL_FONT_BUILD = ROOT / ".tools" / "font-build"
if LOCAL_FONT_BUILD.exists():
    sys.path.insert(0, str(LOCAL_FONT_BUILD))

from fontTools.ttLib import TTFont


FONT_PATH = ROOT / "web" / "assets" / "fonts" / "VectorGrid-Variable.woff2"
KEY_NAME_IDS = {1, 3, 4, 6, 16, 21, 25}
COPYRIGHT_OR_LICENSE_NAME_IDS = {0, 13, 14}


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

    visible_names = [
        (record.nameID, record.toUnicode())
        for record in font["name"].names
        if record.nameID not in COPYRIGHT_OR_LICENSE_NAME_IDS
    ]
    assert all("Orbitron" not in name for _, name in visible_names), visible_names

    instance_names = []
    for instance in font["fvar"].instances:
        for name_id in (instance.subfamilyNameID, instance.postscriptNameID):
            if name_id == 0xFFFF:
                continue
            value = font["name"].getDebugName(name_id)
            assert value is not None, f"fvar instance references missing name ID {name_id}"
            instance_names.append((name_id, value))
    assert instance_names, "VectorGrid variable font should contain named instances"
    assert all("Orbitron" not in name for _, name in instance_names), instance_names
    assert all(
        name.startswith("VectorGrid-")
        for name_id, name in instance_names
        if name_id in {instance.postscriptNameID for instance in font["fvar"].instances}
    ), instance_names
    print({"key_names": names, "instance_names": instance_names})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise
