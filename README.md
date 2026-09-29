# Exemplos de pacotes da loja

| Pasta | ID | Tipo | Destino após download |
|-------|-----|------|------------------------|
| `hello/` | `demo.hello` | raiz | `layers/demo-hello` |
| `hello-notes/` | `demo.hello.notes` | filho | `layers/demo-hello/modules/notes` |

Estas pastas são o formato esperado no monorepo da loja (configurado em Painel → Configurações).

## Publicar

1. Copie a pasta do pacote para o monorepo (ex.: `modules/hello/`)
2. Abra um pull request
3. Em `/panel/loja` → **Sincronizar** → **Baixar**
4. Rebuild/restart e Instale em `/panel/modulos`
