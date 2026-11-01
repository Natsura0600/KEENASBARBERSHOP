/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Baileys es ESM y trae dependencias nativas opcionales: que Next no lo empaquete, que lo cargue tal cual.
  serverExternalPackages: ["@whiskeysockets/baileys", "pino", "libsignal", "ws"],
};

export default nextConfig;
