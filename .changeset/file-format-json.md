---
'logixlysia': minor
---

The log file could only hold the text line, so a log shipper that tails a file or a tool that reads logs had to parse a custom layout, and the only way to get JSON on disk was to redirect the console, which loses rotation. The new `fileFormat: 'json'` option writes the JSON console line to the file, one object per line, with the same keys, order and redaction. Rotation, retention and file modes are unchanged. The default stays `'text'` and no preset changes it.
