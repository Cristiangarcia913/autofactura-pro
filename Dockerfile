# Imagen base optimizada con Node.js 22 LTS
FROM node:22-alpine AS base

# Directorio de trabajo de la aplicación
WORKDIR /app

# Establecer entorno de producción
ENV NODE_ENV=production
ENV PORT=3000

# Instalar dependencias primero para aprovechar la caché de capas de Docker
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el código fuente
COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

# Crear directorio de datos persistentes y asignar permisos al usuario 'node'
RUN mkdir -p /app/data/archivos && chown -R node:node /app

# Usar usuario no root por seguridad
USER node

# Exponer el puerto del servidor HTTP
EXPOSE 3000

# Punto de montaje para la base de datos SQLite y archivos subidos
VOLUME ["/app/data"]

# Comando de arranque
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
