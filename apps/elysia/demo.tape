# Every `Wait` is an assertion — vhs exits non-zero if the pattern never
# appears, so a green recording is also a passing smoke test. They all use
# `Wait+Screen`: bare `Wait` is `Wait+Line`, which only ever sees the last
# line, and that line is the prompt by the time curl has returned.
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
Set TypingSpeed 25ms
Set WaitTimeout 60s

# Setup is hidden so the recording opens on an empty prompt. The prompt shows
# cwd + branch like an oh-my-zsh theme; kept ASCII-only because ANSI escapes
# typed through the PTY proved fragile under ttyd.
Hide
Type "cd apps/elysia" Enter
Type "export PS1='\napps/elysia git:(main) \$ ' PORT=3001" Enter
Type "clear" Enter
Show

# The playground boots and logixlysia prints the start banner. The trailing
# `sleep` keeps the prompt from being drawn into the middle of the banner.
Type@40ms "bun run src/index.ts & sleep 2" Enter
Wait+Screen /localhost:3001/
# Outlast the `sleep` above: typing while it still holds the foreground would
# leave the keystrokes buffered and shift every command that follows.
Sleep 3s

Type "curl localhost:3001/" Enter
Wait+Screen /GET/
Sleep 900ms

# Per-request context rendered as a tree under the request line. A typo gets
# caught and fixed before Enter, the way a real keyboard slips sometimes.
Type@12ms "curl localhost:3001/chekout"
Sleep 450ms
Backspace Backspace Backspace Backspace
Type@10ms "ckout"
Sleep 250ms
Enter
Wait+Screen /usr_demo/
Sleep 1100ms

Type@12ms "curl localhost:3001/auto-redact"
Sleep 300ms
Enter
Wait+Screen /REDACTED/
Sleep 1300ms

Type@12ms "curl localhost:3001/status/404"
Sleep 200ms
Enter
Wait+Screen /"status":404/
Sleep 900ms

Type@12ms "curl localhost:3001/boom"
Sleep 350ms
Enter
Wait+Screen /Boom!/
Sleep 1300ms

Type@14ms "curl -X POST localhost:3001/chat"
Sleep 300ms
Enter
Wait+Screen /inputTokens/
Sleep 1600ms

Screenshot artifacts/logixlysia-demo.png
Sleep 800ms

Type "kill %1" Enter
Sleep 700ms
# Clear before the recording ends so the GIF loops back to the empty prompt
# it opened on.
Type "clear" Enter
Sleep 500ms
