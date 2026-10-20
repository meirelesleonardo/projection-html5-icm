#!/usr/bin/env bash
# Gera ProjecaoICM.exe (Windows x64) neste Linux. Precisa de rede para baixar o Node de Windows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$ROOT/dist/ProjecaoICM-win64"
PKG_TARGET="node22-win-x64"

cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl não encontrado. Ele é necessário para baixar o Node do empacotador." >&2
  exit 1
fi

# O @yao-pkg/pkg atual exige Node 22 para rodar. O aplicativo continua em Node 18+.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -ge 22 ]]; then
  PACK_NODE="$(command -v node)"
  PACK_NPX="$(command -v npx)"
else
  case "$(uname -m)" in
    x86_64) NODE_ARCH="linux-x64" ;;
    aarch64) NODE_ARCH="linux-arm64" ;;
    *)
      echo "Arquitetura $(uname -m) sem tarball do Node 22 para o empacotador." >&2
      exit 1
      ;;
  esac
  CACHE="$ROOT/tools/windows-pack/.cache"
  mkdir -p "$CACHE"
  TARBALL="$(curl -fsSL "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" | awk -v arch="$NODE_ARCH" '$2 ~ ("node-v22\\..*-" arch "\\.tar\\.xz$") { print $2; exit }')"
  if [[ -z "$TARBALL" ]]; then
    echo "Falha ao descobrir o Node 22 em nodejs.org. Confira a rede e rode de novo." >&2
    exit 1
  fi
  if [[ ! -x "$CACHE/${TARBALL%.tar.xz}/bin/node" ]]; then
    echo "Baixando ${TARBALL} só para empacotar…"
    curl -fL --retry 3 -o "$CACHE/$TARBALL" "https://nodejs.org/dist/latest-v22.x/$TARBALL" || {
      echo "Falha ao baixar o Node 22. O empacotador precisa dele; confira a rede e rode de novo." >&2
      exit 1
    }
    tar -xJf "$CACHE/$TARBALL" -C "$CACHE"
  fi
  PACK_NODE="$CACHE/${TARBALL%.tar.xz}/bin/node"
  PACK_NPX="$CACHE/${TARBALL%.tar.xz}/bin/npx"
fi

rm -rf "$STAGE"
mkdir -p \
  "$STAGE/server/certs" \
  "$STAGE/data/backups" \
  "$STAGE/data/imports" \
  "$STAGE/data/sync-conflicts" \
  "$STAGE/media/videos" \
  "$STAGE/media/tmp" \
  "$STAGE/media/images" \
  "$STAGE/media/decks"

for file in index.html view.html mobile.html manifest.webmanifest sw.js; do
  cp -a "$ROOT/$file" "$STAGE/$file"
done

for dir in css js fontes imagens icons; do
  cp -a "$ROOT/$dir" "$STAGE/$dir"
done

cp -a "$ROOT/data/data.json" "$STAGE/data/data.json"
if [[ -f "$ROOT/data/library-meta.json" ]]; then
  cp -a "$ROOT/data/library-meta.json" "$STAGE/data/library-meta.json"
fi

python3 - "$ROOT/server/config.json" "$STAGE/server/config.json" <<'PY'
import json, sys
src, dest = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as fh:
    cfg = json.load(fh)
cfg["syncToken"] = ""
with open(dest, "w", encoding="utf-8") as fh:
    json.dump(cfg, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY

echo "Empacotando servidor para ${PKG_TARGET}…"
# O shebang do npx usa "env node". O Node 22 precisa ser o primeiro do PATH.
# --public evita bytecode do V8: o bytecode gerado no Linux é recusado no Windows.
export PATH="$(dirname "$PACK_NODE"):$PATH"
hash -r
PACK_VERSION="$("$PACK_NODE" -p process.versions.node)"
echo "Empacotador: Node $PACK_VERSION ($PACK_NODE)"
if [[ "${PACK_VERSION%%.*}" -lt 22 ]]; then
  echo "O empacotador está no Node $PACK_VERSION. É preciso Node 22 para o alvo $PKG_TARGET." >&2
  exit 1
fi
if ! "$PACK_NODE" "$PACK_NPX" --yes @yao-pkg/pkg "$ROOT/server/index.js" --targets "$PKG_TARGET" --public --public-packages "*" --output "$STAGE/ProjecaoICM.exe"; then
  echo "Falha ao gerar o exe. Confira a rede: o pkg precisa baixar o Node de Windows." >&2
  exit 1
fi

if [[ ! -f "$STAGE/ProjecaoICM.exe" ]]; then
  echo "O pkg terminou sem gravar $STAGE/ProjecaoICM.exe." >&2
  exit 1
fi

(
  cd "$ROOT/dist"
  rm -f ProjecaoICM-win64.zip
  zip -r ProjecaoICM-win64.zip ProjecaoICM-win64
)

echo "Pronto: $ROOT/dist/ProjecaoICM-win64.zip"
echo "No PC Windows, preencha syncUrl e syncToken em server/config.json se for usar a VPS."
