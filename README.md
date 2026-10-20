# 🧾 AutoFactura Pro

> **Extracción inteligente de facturas y tickets mediante IA multimodal (Claude Vision), validación contable tributaria y exportación oficial a Excel para gestoría (Modelos 303 y 130).**

<p align="left">
  <a href="https://github.com/Cristiangarcia913/autofactura-pro/actions/workflows/ci.yml">
    <img src="https://github.com/Cristiangarcia913/autofactura-pro/actions/workflows/ci.yml/badge.svg" alt="CI Status" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/Node.js-v22+-339933?logo=node.js&logoColor=white" alt="Node.js 22+" />
  </a>
  <a href="https://www.docker.com">
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker Ready" />
  </a>
  <a href="https://console.anthropic.com">
    <img src="https://img.shields.io/badge/Anthropic-Claude_Vision-D97706?logo=anthropic&logoColor=white" alt="Anthropic Claude" />
  </a>
  <img src="https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
</p>

---

## 💡 ¿Qué es AutoFactura Pro?

AutoFactura Pro es una solución full-stack concebida para autónomos, pymes y asesorías:
1. **Carga masiva:** Sube facturas y tickets en bloque (`PDF`, `JPG`, `PNG`, `WEBP`).
2. **Extracción por IA:** La visión multimodal de Claude lee los documentos, infiere NIFs/CIFs, fechas, tipos de gasto y desglosa bases imponibles de IVA (21%, 10%, 4%, exento) e IRPF.
3. **Auditoría & Cuadre:** Aplica lógica fiscal española con tolerancia de ±0,02 € y detecta duplicados por SHA-256 o por combinación de emisor + importe + fecha.
4. **Exportación Contable:** Genera un libro Excel nativo de 4 pestañas listo para entregar al asesor o presentar los modelos 303 (IVA) y 130 (IRPF).

---

## 🛠️ Arquitectura y Stack Tecnológico

| Componente | Tecnología | Justificación |
|---|---|---|
| **Frontend** | Vanilla HTML5 / CSS3 / ES Modules | Interfaz ligera y reactiva, sin pasos de compilación ni dependencias pesadas. |
| **Backend** | Node.js + Express + Multer | API REST orientada a eventos para carga de ficheros y streaming multipart. |
| **IA / Visión** | Anthropic Claude SDK (`@anthropic-ai/sdk`) | Procesamiento directo de imágenes y PDFs vectoriales con salida estructurada en JSON. |
| **Persistencia** | SQLite nativo (`node:sqlite`) | Almacenamiento local ultrarrápido sin dependencias C++ externas ni servidores de BDD dedicados. |
| **Generación Excel** | ExcelJS | Fórmulas contables vivas (`SUMIF`, `SUM`), formateo de divisas y autofiltros. |
| **Infraestructura** | Docker & Docker Compose | Contenedorización lista para producción con volúmenes persistentes. |
| **CI / CD** | GitHub Actions | Ejecución automática de pruebas de integración en Ubuntu y Windows (Node 22 y 24). |

---

## 🚀 Despliegue e Inicio Rápido

### Opción 1: Con Docker Compose (Recomendado)

Si dispones de [Docker Desktop](https://www.docker.com/products/docker-desktop):

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/Cristiangarcia913/autofactura-pro.git
   cd autofactura-pro
   ```

2. **Configura tus variables de entorno:**
   ```bash
   cp .env.example .env
   ```
   *Rellena `ANTHROPIC_API_KEY` y tu `USER_NIF` (tu NIF personal para identificar si una factura es un Gasto o un Ingreso emitido por ti).*

3. **Inicia el contenedor:**
   ```bash
   docker compose up -d
   ```
4. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

### Opción 2: Ejecución Local con Node.js

Requiere **Node.js 22.13 LTS** o superior.

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar el entorno:**
   Copia `.env.example` a `.env` y define tus claves:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api...
   USER_NIF=12345678Z
   ```

3. **Arrancar la aplicación:**
   ```bash
   npm start
   ```

4. **Modo Demo (Sin consumir API ni clave):**
   Puedes evaluar la aplicación completamente gratis utilizando el simulador con datos de prueba:
   ```bash
   npm run demo
   # o en Windows con variable de entorno:
   # set MOCK_AI=1 && npm start
   ```

---

## 🧪 Pruebas Automatizadas (Testing)

El proyecto incluye una suite de pruebas de integración y humo que valida el motor de cuadre contable, validación de NIFs, prevención de duplicados y generación de libros Excel sin requerir conexión a internet ni claves de API:

```bash
npm test
```

---

## 📊 Reglas de Negocio y Auditoría Fiscal

* **Ecuación de Cuadre:** `Total Base + Total IVA + Recargo de Equivalencia − Retención IRPF = Importe Total` *(tolerancia admisible: ±0,02 €)*.
* **Marcado de Revisión:** Las filas se marcan en amarillo cuando la confianza de la IA es inferior al 85%, existe descuadre numérico, el NIF no cumple el algoritmo de control o faltan campos esenciales.
* **Control de Duplicados:** Detección automática por hash SHA-256 del fichero o colisión de emisor + importe + fecha. Un documento duplicado permanece en cuarentena hasta su validación manual.
* **Clasificación Automática de Flujos:** Si el NIF del emisor coincide con `USER_NIF`, se computa automáticamente como **Ingreso** (factura emitida); de lo contrario, se clasifica como **Gasto**.

---

## 📑 Estructura del Libro Excel Generado

1. **Resumen Trimestral (IVA e IRPF):** Fórmulas dinámicas de desglose trimestral (T1–T4) por tramos de IVA (21%, 10%, 4%) correspondientes a las casillas oficiales del **Modelo 303** y liquidación del **Modelo 130**.
2. **Libro Registro de Gastos y Tickets:** Formato estandarizado con autofiltro y enlaces a los documentos originales.
3. **Libro Registro de Ingresos:** Facturas emitidas con desglose impositivo.
4. **Incidencias y Pendientes:** Auditoría de discrepancias para subsanación contable.

---

## 📂 Organización del Proyecto

```text
├── .github/workflows/   # Flujos de integración continua (CI) con GitHub Actions
├── data/                # Persistencia local (autofactura.db y almacenamiento de archivos)
├── lib/
│   ├── db.js            # Capa de datos con SQLite nativo (node:sqlite)
│   ├── excel.js         # Motor de generación de libros contables con ExcelJS
│   ├── extract.js       # Orquestador del prompt y llamadas a Claude Vision
│   └── validate.js      # Lógica fiscal pura, validación de NIFs y cuadres
├── public/              # Interfaz web SPA (Dashboard, carga masiva, edición en tiempo real)
├── test/
│   └── smoke.js         # Suite de pruebas unitarias y de integración
├── Dockerfile           # Construcción de imagen de producción optimizada
├── docker-compose.yml   # Orquestación de contenedores y volúmenes
└── server.js            # Servidor HTTP Express y endpoints de la API
```

---

## 👤 Autor

**Cristian García Del Olmo**
* Estudiante del Grado en Ingeniería Informática — Universidad Camilo José Cela (UCJC)
* GitHub: [@Cristiangarcia913](https://github.com/Cristiangarcia913)
* Email: [cristiangarciadelolmo06@gmail.com](mailto:cristiangarciadelolmo06@gmail.com)

---

## 📄 Licencia

Este proyecto está distribuido bajo los términos de la [Licencia MIT](LICENSE).
