# landing-ane-viana

Landing page estatica pronta para deploy em VPS via EasyPanel.

## Estrutura

- `public/`: site final servido em producao
- `public/index.html`: pagina principal
- `public/assets/`: logos e thumbs usadas pela landing
- `public/media/`: imagens finais usadas na landing
- `Dockerfile`: imagem final com `nginx:alpine`
- `nginx.conf`: configuracao do servidor web

## Rodando localmente com Docker

```bash
docker build -t landing-ane-viana .
docker run --rm -p 8080:80 landing-ane-viana
```

Depois acesse `http://localhost:8080`.

## Deploy

O fluxo pensado para producao e:

1. subir este repositorio para o GitHub
2. conectar o repositorio no EasyPanel
3. configurar build por `Dockerfile`
4. publicar e apontar o dominio no Registro.br
