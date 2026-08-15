# Logixlysia — recorded terminal demo of the playground in `apps/elysia`.
#
# VHS drives a real PTY, so the frames show exactly what a developer sees:
# colours, the context tree, redaction, and the error formatting that unit
# tests cannot assert on.
#
# Every `Wait` is an assertion — vhs exits non-zero if the pattern never
# appears, so a green recording is also a passing smoke test.
#
# Run locally from the repository root (needs vhs, ttyd and ffmpeg):
#   bun install && bun run build --filter logixlysia
#   mkdir -p artifacts && vhs apps/elysia/demo.tape

Require bun
Require curl

Output artifacts/logixlysia-demo.gif
Output artifacts/logixlysia-demo.mp4

Set Shell bash
Set Theme "Catppuccin Mocha"
# Sized so the whole demo fits on one screen without scrolling: `Wait+Screen`
# reads buffer rows 0..term.rows-1, so it goes stale as soon as the terminal
# scrolls and every assertion below would time out. Adding output means adding
# height.
Set FontSize 15
Set Width 1400
Set Height 940
Set Padding 24
Set Margin 24
Set MarginFill "#11111b"
Set BorderRadius 12
Set WindowBar Colorful
Set TypingSpeed 45ms
Set WaitTimeout 60s

# Setup is hidden so the recording opens on an empty prompt.
Hide
Type "cd apps/elysia" Enter
Type "export PS1='\n$ ' PORT=3001" Enter
Type "clear" Enter
Show

# The playground boots and logixlysia prints the start banner. The trailing
# `sleep` keeps the prompt from being drawn into the middle of the banner.
Type "bun run src/index.ts & sleep 2" Enter
Wait+Screen /localhost:3001/
# Outlast the `sleep` above: typing while it still holds the foreground would
# leave the keystrokes buffered and shift every command that follows.
Sleep 3s

# A plain 200: level, service tag, method, path, status, duration.
Type "curl -s localhost:3001/" Enter
Wait+Screen /GET/
Sleep 1s

# Per-request context rendered as a tree under the request line.
Type "curl -s localhost:3001/checkout" Enter
Wait+Screen /usr_demo/
Sleep 1s

# autoRedact scrubs the card, e-mail, IP and JWT before they reach stdout.
Type "curl -s localhost:3001/auto-redact" Enter
Wait+Screen /REDACTED/
Sleep 1500ms

# 4xx degrades the line to WARNING.
Type "curl -s localhost:3001/status/404" Enter
Wait+Screen /"status":404/
Sleep 1s

# A thrown handler error becomes a red ERROR line with the message attached.
Type "curl -s localhost:3001/boom" Enter
Wait+Screen /Boom!/
Sleep 1500ms

# AI metrics ride along on the request line.
Type "curl -s -X POST localhost:3001/chat" Enter
Wait+Screen /inputTokens/
Sleep 2s

Screenshot artifacts/logixlysia-demo.png
# Let the screenshot frame land before the next keystroke shows up in it.
Sleep 1s

Type "kill %1" Enter
Sleep 1s
