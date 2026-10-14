// Se importa el primero en server.js para que .env esté cargado antes que el resto de módulos.
try {
  process.loadEnvFile();
} catch {
  // No hay .env: se usan las variables de entorno del sistema.
}
