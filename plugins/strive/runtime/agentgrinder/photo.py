"""THE RUN PHOTO — a picture of where you were while the agent worked, on your own local card.

The trace is the proof; the photo is what makes someone stop scrolling. It is the one thing on
the card that is DECLARED, not measured, and the card says so under it.

A phone photo carries the place it was taken. So the bytes are rewritten before they reach the
card: JPEG keeps only the segments needed to draw the picture (JFIF, the ICC colour profile, the
Adobe marker, the image data) plus a fresh four-byte orientation tag, so a portrait photo does not
turn sideways once its EXIF is gone. PNG keeps only the chunks needed to draw it. Every other
segment -- EXIF with GPS, camera and time, XMP, IPTC, maker notes, comments, text chunks -- is
dropped, and the names of what was dropped are returned so the CLI can print them.

The photo never enters the run dict, so `--json`, `--push` and the local series never carry it.
Stdlib only, like the rest of the CLI.
"""
from __future__ import annotations

import base64
import struct
from dataclasses import dataclass, field
from pathlib import Path

MAX_BYTES = 12 * 1024 * 1024

# APP0 JFIF, APP2 ICC profile, APP14 Adobe colour transform. Nothing that says where or who.
_JPEG_KEEP_APP = {0xE0, 0xE2, 0xEE}
_JPEG_NAMES = {0xE1: "EXIF/XMP", 0xED: "IPTC", 0xFE: "comment"}
# critical chunks plus the ones that change how the pixels look
_PNG_KEEP = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"iCCP", b"sRGB", b"gAMA", b"cHRM",
             b"pHYs", b"sBIT"}


@dataclass
class Photo:
    mime: str
    data: bytes
    removed: list[str] = field(default_factory=list)

    def data_uri(self) -> str:
        return f"data:{self.mime};base64," + base64.b64encode(self.data).decode("ascii")


def _exif_orientation(app1: bytes) -> int:
    """Orientation (1-8) from an EXIF APP1 payload, 1 when absent or unreadable."""
    if not app1.startswith(b"Exif\x00\x00"):
        return 1
    t = app1[6:]
    try:
        end = {b"II": "<", b"MM": ">"}[t[:2]]
        (ifd,) = struct.unpack(end + "I", t[4:8])
        (n,) = struct.unpack(end + "H", t[ifd:ifd + 2])
        for k in range(n):
            e = ifd + 2 + 12 * k
            tag, typ, _cnt = struct.unpack(end + "HHI", t[e:e + 8])
            if tag == 0x0112 and typ == 3:
                (v,) = struct.unpack(end + "H", t[e + 8:e + 10])
                return v if 1 <= v <= 8 else 1
    except (KeyError, struct.error):
        pass
    return 1


def _orientation_only_app1(v: int) -> bytes:
    """A minimal EXIF segment holding ONE tag, Orientation. No GPS, no camera, no time."""
    tiff = b"MM\x00\x2a" + struct.pack(">I", 8)
    tiff += struct.pack(">H", 1) + struct.pack(">HHIHH", 0x0112, 3, 1, v, 0) + struct.pack(">I", 0)
    payload = b"Exif\x00\x00" + tiff
    return b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload


def _clean_jpeg(b: bytes) -> tuple[bytes, list[str]]:
    out, removed, orient = bytearray(b"\xff\xd8"), [], 1
    insert_at = 2                           # after JFIF when present: APP0 must follow SOI
    i = 2
    while i < len(b):
        if b[i] != 0xFF:
            raise ValueError("photo: not a readable JPEG (segment marker missing).")
        m = b[i + 1]
        if m == 0xFF:                       # fill byte
            i += 1
            continue
        if m == 0xDA:                       # start of scan: the rest is image data
            if orient != 1:
                out[insert_at:insert_at] = _orientation_only_app1(orient)
            out += b[i:]
            break
        if 0xD0 <= m <= 0xD7 or m == 0x01:
            out += b[i:i + 2]; i += 2
            continue
        (length,) = struct.unpack(">H", b[i + 2:i + 4])
        seg = b[i:i + 2 + length]
        if (0xE0 <= m <= 0xEF and m not in _JPEG_KEEP_APP) or m == 0xFE:
            if m == 0xE1 and orient == 1:
                orient = _exif_orientation(b[i + 4:i + 2 + length])
            name = _JPEG_NAMES.get(m, f"APP{m - 0xE0}")
            if name not in removed:
                removed.append(name)
        else:
            out += seg
            if m == 0xE0 and insert_at == 2:
                insert_at = len(out)
        i += 2 + length
    else:
        raise ValueError("photo: JPEG ended before any image data.")
    return bytes(out), removed


def _clean_png(b: bytes) -> tuple[bytes, list[str]]:
    out, removed, i = bytearray(b[:8]), [], 8
    while i + 8 <= len(b):
        (length,) = struct.unpack(">I", b[i:i + 4])
        kind = b[i + 4:i + 8]
        chunk = b[i:i + 12 + length]
        if kind in _PNG_KEEP:
            out += chunk
        else:
            name = kind.decode("latin-1")
            if name not in removed:
                removed.append(name)
        i += 12 + length
        if kind == b"IEND":
            break
    return bytes(out), removed


def load_photo(path: str | Path) -> Photo:
    """Read a JPEG or PNG and return it with everything but the picture removed."""
    p = Path(path)
    b = p.read_bytes()
    if len(b) > MAX_BYTES:
        raise ValueError(f"photo: {len(b) // (1024 * 1024)} MB is over the {MAX_BYTES // (1024 * 1024)} MB limit.")
    if b[:3] == b"\xff\xd8\xff":
        data, removed = _clean_jpeg(b)
        return Photo("image/jpeg", data, removed)
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        data, removed = _clean_png(b)
        return Photo("image/png", data, removed)
    raise ValueError("photo: only JPEG and PNG are supported. Export a HEIC as JPEG first.")
