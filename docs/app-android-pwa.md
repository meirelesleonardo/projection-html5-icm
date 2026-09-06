# App Android / PWA

## Uso recomendado com hotspot (IP dinâmico)

1. Projetor mostra o QR.
2. Abra o link no **Chrome** do Android.
3. Controle o culto nessa aba.

Não dependa de um atalho instalado apontando para `http://192.168.x.y` — o IP muda e o atalho quebra.

## PWA (quando o hostname funciona)

Se o Android resolver `projection-icm.local` (Avahi no Zorin):

1. Abra `http://projection-icm.local:3080/mobile.html`
2. Menu Chrome → **Instalar aplicativo** / **Adicionar à tela inicial**
3. O origin fica estável pelo hostname

Se `.local` falhar no hotspot, volte ao fluxo do QR.

## Service worker

`sw.js` faz cache do shell (HTML/CSS/JS do mobile). APIs, WebSocket e `/media` **não** são cacheados.

## Capacitor (plano B — APK)

Use se precisar de APK com descoberta embutida, sem origin HTTP fixo.

### Ambiente

- Node.js 18+
- Android Studio (SDK + emulador ou aparelho)
- JDK 17

### Passos resumidos

```bash
cd projection-html5-icm
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android --save-dev
npx cap init "Projecao ICM" br.org.icm.projecao --web-dir .
npx cap add android
# Ajuste capacitor.config para server.url em dev, ou copie mobile como entry
npx cap open android
```

No app nativo, a tela inicial pode abrir um WebView apontando para o host descoberto (QR / scan) em vez de um IP embutido.

Detalhes oficiais: [capacitorjs.com/docs](https://capacitorjs.com/docs).
