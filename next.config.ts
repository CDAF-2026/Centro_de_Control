import type { NextConfig } from "next";

// Las fotos de perfil se sirven desde el bucket público `avatares` de Supabase.
// `next/image` exige declarar el dominio; se deriva de la URL del proyecto para
// no repetir el identificador a mano. Con guarda, para que un entorno sin la
// variable no rompa el build.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  // ⚠️ Todo lo que se sube en esta app (foto de perfil, contratos, documentos del
  // cliente, soportes de gasto, Excel de importación) viaja por una Server Action,
  // y Next las corta en **1 MB** por defecto. O sea que los topes escritos en el
  // código —2 MB la foto, 10 MB los documentos— nunca fueron reales: el archivo
  // se rechazaba antes de llegar a validarse. Se sube a 12 MB para que quepan de
  // verdad los 10 MB que los documentos ya prometen, más el sobrecosto del
  // multipart. El tope de cada cosa se sigue validando en su server action.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
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
