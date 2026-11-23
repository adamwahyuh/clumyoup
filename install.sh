#!/bin/sh
# Builds Clumyoup from this checkout and installs it for the current user (no sudo):
#   app     -> ~/Applications/Clumyoup.app
#   command -> ~/.local/bin/clumyoup   (run `clumyoup .` inside a folder of videos)
# Needs Node.js and Rust. Run again to update. Uninstall: delete those two paths.
# shortcut: macOS only; add an install.ps1 + clumyoup.cmd when a Windows build is needed.
set -eu

cd "$(dirname "$0")"
[ "$(uname)" = Darwin ] || { echo "This installer is for macOS." >&2; exit 1; }

npm ci
npm run tauri build -- --bundles app

app="$HOME/Applications/Clumyoup.app"
bin="$HOME/.local/bin"
mkdir -p "$HOME/Applications" "$bin"
rm -rf "$app"
cp -R src-tauri/target/release/bundle/macos/Clumyoup.app "$app"

cat > "$bin/clumyoup" <<EOF
#!/bin/sh
# Opens Clumyoup on a folder, like \`code .\`
dir="\$(cd "\${1:-.}" 2>/dev/null && pwd)" || { echo "clumyoup: no such folder: \$1" >&2; exit 1; }
nohup "$app/Contents/MacOS/clumyoup" "\$dir" >/dev/null 2>&1 &
EOF
chmod +x "$bin/clumyoup"

echo
echo "Installed. Open a folder of videos with:  clumyoup ."
case ":$PATH:" in
*":$bin:"*) ;;
*) echo "Add this line to ~/.zshrc first, then open a new terminal:"
   echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac
