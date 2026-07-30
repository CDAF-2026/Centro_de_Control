import type { NextConfig } from "next";

// Las fotos de perfil se sirven desde el bucket público `avatares` de Supabase.
// `next/image` exige declarar el dominio; se deriva de la URL del proyecto para
// no repetir el identificador a mano. Con guarda, para que un entorno sin la
// variable no rompa el build.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
