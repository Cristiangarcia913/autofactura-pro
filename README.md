# AutoFactura Pro

Sube facturas y tickets (PDF, JPG, PNG, WEBP) en bloque → una IA los lee → se desglosan IVA e IRPF →
revisas y corriges en una tabla → exportas un Excel de 4 pestañas para tu gestoría (Modelos 303 y 130).

## Cómo ejecutarla

1. Instala **Node.js 22.13 o superior** (https://nodejs.org, versión LTS). Comprueba con `node -v`.
2. Abre una terminal en esta carpeta e instala las dependencias:
   ```
   npm install
   ```
3. Copia `.env.example` como `.env` y rellénalo:
   - `ANTHROPIC_API_KEY`: clave de https://console.anthropic.com (de pago por uso; es independiente de tu suscripción de claude.ai).
   - `USER_NIF`: tu NIF/CIF, para distinguir **Ingresos** (emites tú) de **Gastos**.
4. Arranca:
   ```
   npm start
   ```
5. Abre http://localhost:3000

**Probar sin clave de API:** `npm run demo` (en Windows: pon `MOCK_AI=1` en `.env` y usa `npm start`).
Rellena datos de ejemplo para que veas la interfaz y el Excel.

**Comprobar que todo funciona:** `npm test`.

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JavaScript sin framework | Sin compilación; un solo comando para ejecutarlo |
| Backend | Node.js + Express + Multer | API sencilla, subida de archivos |
| IA / visión | Claude (SDK `@anthropic-ai/sdk`), lee imágenes y PDF directamente | Sin OCR aparte; devuelve JSON estructurado |
| Base de datos | SQLite (módulo integrado `node:sqlite`) | Un archivo local, sin instalar nada |
| Excel | ExcelJS | Fórmulas nativas, filtros, formatos, hipervínculos |

Los datos viven en `./data/` (`autofactura.db` + carpeta `archivos/` con los originales).

## Estructura

```
server.js          API (subida, edición, resumen, exportación)
lib/validate.js    NIF/CIF, trimestres, cuadre ±0,02 €, estado de revisión (lógica pura)
lib/db.js          SQLite, duplicados, KPIs
lib/extract.js     Prompt del sistema + llamada a la IA + modo demo
lib/excel.js       Libro de 4 pestañas
public/            Dashboard, carga masiva, tabla editable, filtros
test/smoke.js      Pruebas
```

## Base de datos (tabla `documentos`)

| Grupo | Columnas |
|---|---|
| Identidad | `id`, `creado_en`, `archivo_nombre`, `archivo_ruta`, `archivo_mime`, `archivo_hash` (SHA-256) |
| Clasificación | `flujo` (Gasto/Ingreso), `tipo_documento` (Factura/Ticket), `categoria` |
| Cabecera | `fecha_emision` (ISO), `anio`, `trimestre`, `numero_factura`, `entidad_nombre`, `entidad_nif` |
| IVA | `base_21`, `cuota_21`, `base_10`, `cuota_10`, `base_4`, `cuota_4`, `base_exenta` |
| IRPF / recargo | `irpf_pct`, `irpf_cuota`, `recargo_pct`, `recargo_cuota` |
| Totales | `total_base`, `total_iva`, `importe_total` |
| Control | `confianza`, `observaciones`, `cuadra`, `duplicado_de`, `problemas` (JSON), `estado`, `revisado` |

## Reglas que aplica

- **Cuadre**: `base total + IVA total + recargo − IRPF = importe total` con tolerancia de ±0,02 €.
- **Revisión (fila amarilla)**: confianza < 85 %, descuadre, fecha o importes ilegibles, factura sin NIF, NIF con formato/dígito de control incorrecto, observaciones de la IA o posible duplicado.
- **Duplicados**: mismo archivo (hash), mismo NIF + fecha + importe, o mismo NIF + nº de factura. Un duplicado no se contabiliza (ni en KPIs ni en el Excel) hasta que lo validas con ✔.
- **Ingreso/Gasto**: si el NIF del emisor es el tuyo (`USER_NIF`) es Ingreso; en otro caso, Gasto. Se puede cambiar a mano en la tabla.

## Excel exportado

1. **Resumen Trimestral (IVA e IRPF)**: fórmulas `SUMIF`/`SUM` (en Excel en español se ven como `SUMAR.SI`/`SUMA`). IVA devengado vs deducible por tramos 21/10/4 % con las casillas del Modelo 303, y Modelo 130 acumulado (hay una fila amarilla para anotar los pagos de trimestres anteriores).
2. **Libro de Gastos y Tickets**: cabeceras fijas, autofiltro, formato moneda, filas pendientes en amarillo, enlace al archivo original.
3. **Libro de Ingresos**: misma estructura.
4. **Incidencias - Para Revisar**: lo que falta o no cuadra (Excel no admite la `/` en nombres de pestaña, por eso lleva guion).

Los enlaces "Abrir archivo" solo funcionan mientras la app está arrancada en tu ordenador.

## Importante

- Es una herramienta de apoyo: los cálculos de los modelos 303 y 130 son **orientativos**. Revisa con tu gestor antes de presentar nada.
- La app no tiene usuario/contraseña. Por defecto solo escucha en `127.0.0.1` (tu propio equipo). No la expongas a Internet tal cual.
- Fotos HEIC del iPhone: conviértelas a JPG. Imágenes de más de 5 MB: reduce el tamaño o sube el PDF.
