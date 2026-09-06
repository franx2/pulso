import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `node-unrar-js` carga un `.wasm` en tiempo de ejecución. Si el bundler lo
   * empaqueta, ese archivo queda fuera de la función serverless y la
   * descompresión falla recién en producción — justo donde está el proveedor
   * que manda los remitos en RAR. Dejándolo externo, Vercel lo sube tal cual
   * desde node_modules.
   */
  serverExternalPackages: ["node-unrar-js"],
};

export default nextConfig;
