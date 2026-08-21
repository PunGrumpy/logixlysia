# Logixlysia — recorded terminal demo of the playground in `apps/elysia`.
#
# VHS drives a real PTY, so the frames show exactly what a developer sees:
# colours, the context tree, redaction, and the error formatting that unit
# tests cannot assert on.
#
# Every `Wait` is an assertion — vhs exits non-zero if the pattern never
# appears, so a green recording is also a passing smoke test. Only the boot
# banner uses `Wait+Screen` (it must be visible); the rest use plain `Wait`
# so a little scrollback never breaks the run.
#
# Pacing notes: typing speed varies per command (config commands are typed
# slower than muscle-memory curls), there are pauses before Enter, one
# typo-and-fix on `/checkout`, and the video ends on a cleared prompt so the
# GIF loops cleanly.
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
Set FontSize 15
Set Width 1400
Set Height 940
Set Padding 24
Set Margin 24
Set MarginFill "#11111b"
Set BorderRadius 12
Set WindowBar Colorful
Set TypingSpeed 25ms
Set WaitTimeout 60s

# Setup is hidden so the recording opens on an empty prompt. The prompt
# mimics an oh-my-zsh style theme (cwd + git branch) instead of a bare `$`.
Hide
Type "cd apps/elysia" Enter
Type "export PS1='\n\[\033[01;34m\]apps/elysia\[\033[00m\] \[\033[01;33m\]git:(\[\033[00;31m\]main\[\033[01;33m\])\[\033[00m\] \$ '" Enter
Type "clear" Enter
Show

# The playground boots and logixlysia prints the start banner. Running it
# backgrounded returns the prompt immediately, like a real session.
Type@40ms "bun run src/index.ts &" Enter
Wait+Screen /localhost:3001/
Sleep 800ms

# A plain 200: level, service tag, method, path, status, duration.
Type@12ms "curl -s localhost:3001/"
Sleep 250ms
Enter
Wait /GET/
Sleep 900ms

# Per-request context rendered as a tree under the request line. A typo gets
# caught and fixed before Enter, the way a real keyboard slips sometimes.
Type@12ms "curl -s localhost:3001/chekout"
Sleep 450ms
Backspace Backspace Backspace Backspace
Type@10ms "ckout"
Sleep 250ms
Enter
Wait /usr_demo/
Sleep 1100ms

# autoRedact scrubs the card, e-mail, IP and JWT before they reach stdout.
Type@12ms "curl -s localhost:3001/auto-redact"
Sleep 300ms
Enter
Wait /REDACTED/
Sleep 1300ms

# 4xx degrades the line to WARNING.
Type@12ms "curl -s localhost:3001/status/404"
Sleep 200ms
Enter
Wait /"status":404/
Sleep 900ms

# A thrown handler error becomes a red ERROR line with the message attached.
Type@12ms "curl -s localhost:3001/boom"
Sleep 350ms
Enter
Wait /Boom!/
Sleep 1300ms

# AI metrics ride along on the request line.
Type@14ms "curl -s -X POST localhost:3001/chat"
Sleep 300ms
Enter
Wait /inputTokens/
Sleep 1600ms

Screenshot artifacts/logixlysia-demo.png
Sleep 800ms

Type "kill %1" Enter
Sleep 700ms
# Clear before the recording ends so the GIF loops back to the empty prompt
# it opened on.
Type "clear" Enter
Sleep 500ms
