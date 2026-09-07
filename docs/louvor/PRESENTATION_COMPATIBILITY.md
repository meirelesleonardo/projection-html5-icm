# PRESENTATION_COMPATIBILITY

Capacidade real da aplicação de projetar conteúdo vindo de apresentações e mídia.  
Baseado no código (`server/decks.js`, `js/core.js`, `js/mobile.js`, `view.html`, `css/view.css`) e na análise do PPTX 2022.

---

## 1. Dois problemas distintos

| Problema | Status na app |
|----------|----------------|
| **PPTX Parsing** (extrair texto/estrutura para biblioteca) | **Não implementado** |
| **PPTX Rendering** (mostrar slides no projetor) | **Parcial** via conversão → PNG (decks) |

Não assumir que extrair o PPTX implica reproduzir a apresentação fielmente como objeto PowerPoint.

---

## 2. Matriz de compatibilidade

Classificação: `FULL` | `PARTIAL` | `TEXT_ONLY` | `UNSUPPORTED`

| Capacidade | Biblioteca (JSON) | Deck (PNG) | Notas |
|------------|-------------------|------------|-------|
| Texto de letra | **FULL** | FULL (raster) | JSON é o caminho editável/buscável |
| Marcadores CORO/BIS/Nx | **FULL** (HTML+CSS) | FULL (se estiver no PNG) | Chaves via `blockquote.chave-*` |
| Imagem avulsa (upload) | **FULL** (playlist `image`) | — | Base64 / arquivo imagem |
| Imagem embutida em PPTX | UNSUPPORTED no JSON | **PARTIAL** | Rasterizada no PNG do slide |
| Fundo / master PPTX | UNSUPPORTED | **PARTIAL** | Vira pixels no PNG |
| GIF em PPTX | **UNSUPPORTED** | UNSUPPORTED | Decks são PNG estáticos |
| GIF como imagem avulsa | **PARTIAL** | — | Browser pode animar `image/*` fora do deck |
| Vídeo em PPTX | **UNSUPPORTED** | UNSUPPORTED | — |
| Vídeo standalone | **FULL** | — | `media/videos/` + playlist `video` |
| Animação de objeto PPTX | **UNSUPPORTED** | UNSUPPORTED | Flattened / ausente |
| Transição PPTX | **UNSUPPORTED** | **PARTIAL** | Reveal usa `fade` global; timing OOXML ignorado |
| Fontes embutidas PPTX | UNSUPPORTED | **PARTIAL** | Só o que o LibreOffice rasterizar |
| SVG (letra) | UNSUPPORTED | UNSUPPORTED | SVG só em UI (flags etc.) |
| Abrir PPTX nativo no browser | **UNSUPPORTED** | — | Docs: navegador não abre PowerPoint direto |

---

## 3. Pipeline de decks (existente)

```text
.pptx|.ppt|.odp|.pdf
        ↓  LibreOffice (se não for PDF)
       PDF
        ↓  pdftoppm -png -r 150
  media/decks/<id>/slide-N.png + meta.json
        ↓
  playlist type "deck" → <img class="deck-img"> no Reveal
```

Timeouts típicos: soffice ~240s, pdftoppm ~180s.  
**Risco CONFIRMADO:** PPTX 2022 com **2965 slides** pode estourar tempo/disco.

Recomendação operacional (já sugerida em manuais): exportar PDF antes, ou fatiar o arquivo.

---

## 4. PPTX 2022 — perfil deste arquivo

Arquivo: `docs/01.COLETÂNEA_IGREJAS-2022_PROJETOR-4.3.pptx`

| Aspecto | Valor |
|---------|-------|
| Slides | 2965 |
| Louvores ~ | 789 (números 1–794, 5 faltando) |
| Mídia | 4 PNGs |
| GIF / vídeo | 0 |
| Animações de objeto | 0 |
| Transições | fade em todos os slides |
| Formato | 4:3 |

Compatibilidade prática deste arquivo:

- Como **fonte de biblioteca (texto):** adequado (parsing a implementar).
- Como **deck visual integral:** possível mas operacionalmente pesado; conteúdo é majoritariamente texto estático.

---

## 5. Coletâneas infantis (CIA)

CIA 2018 na biblioteca atual é **texto JSON** (mesmos `{title,content}`), com linhas tipicamente mais curtas.

Se futuras fontes CIA vierem como PPTX com fundos/personagens/animações:

| Elemento | Estratégia |
|----------|------------|
| Texto | Extrair para biblioteca quando legível |
| Fundo / arte estática | Deck PNG ou imagem de slide |
| Animação / transição | Ignorar + diagnosticar |
| Slide só gráfico | `needsReview` + fallback deck/imagem |

Classificação esperada para CIA gráfica: **PARTIAL** (texto + raster), não FULL nativo PPTX.

---

## 6. Política de fallback

```text
PPTX original
  → elementos suportados no caminho escolhido → preservar
  → não suportados → diagnóstico + fallback
```

Ordem preferencial de fallback:

1. Extrair texto + markers → Song JSON (preferido para coletânea de igrejas 2022).
2. Se slide for predominantemente gráfico → rasterizar esse slide (deck ou `image`).
3. Extrair fundo/imagem estática quando útil.
4. Conversão PPTX→PDF→PNG do trecho relevante.
5. Manter arquivo original em `imports/` para reprocessamento.

Exemplo de diagnóstico:

```text
Slide 32
⚠ Elemento não suportado: Animation effect Fly In
Estratégia: preservar texto/imagem; ignorar animação
```

---

## 7. Projeção de louvores JSON (baseline)

**CONFIRMADA**

- Reveal.js, 1920×1080, transição `fade`
- Fundos de tema (`imagens/fundo.jpg`, etc.), não vindos do song
- HTML do `content` renderizado nas `<section>`
- Sem motor de karaoke / animação por linha

Isso define o “padrão visual ICM” que o formatter deve mirar.
