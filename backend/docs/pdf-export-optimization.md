# Optimizacion de PDF (Docs)

## Causa raiz detectada

- El flujo anterior rasterizaba en PNG a 300 DPI de forma predeterminada.
- PNG funciona bien para line-art, pero crece mucho con plantillas complejas e imagen de fondo.
- Se repetia conversion de `imageUrl` a base64 para cajas de imagen duplicadas.
- En PDF vectorial (`pdf-lib`) no se reutilizaban imagenes identicas y las fuentes custom no se subseteaban.

## Cambios implementados

- Perfil por defecto `standard` para backend: 220 DPI efectivo + captura JPEG calidad 82.
- Perfil `high` para backend: 300 DPI efectivo + captura JPEG calidad 90.
- Export de preview frontend ahora permite selector de calidad (`Estandar` / `Alta`) y usa JPEG.
- Cache de conversion `imageUrl -> dataUrl` para evitar trabajo/embebido duplicado en el render.
- Reutilizacion de imagenes embebidas por hash en `pdf-lib` para no duplicar XObjects.
- Embebido de fuentes custom con `subset: true` para reducir peso cuando aplica.

## Como ajustar calidad/tamano

### Frontend (vista `/docs/pdf-preview`)

- `standard`: balance recomendado (220 DPI, JPEG 0.82).
- `high`: mayor nitidez (300 DPI, JPEG 0.90), mayor peso.

El usuario puede cambiarlo desde el selector **Calidad** antes de guardar PDF.

### Backend (`POST /api/templates/:kind/generate`)

Enviar en body:

```json
{
  "qualityProfile": "standard"
}
```

Valores soportados:

- `standard` (default)
- `high`

Si se omite, se usa `standard`.
