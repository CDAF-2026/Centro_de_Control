# Centro de Control — Centro Deportivo Alejandro Falla (CDAF)

Plataforma interna de control y gestión para el **Centro Deportivo Alejandro Falla**.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — base de datos Postgres, autenticación y storage
- **Supabase Auth** con RLS (Row Level Security)

> 🚧 Proyecto en fase inicial (configuración base). La aplicación Next.js se añadirá en los siguientes commits.

## Requisitos

- Node.js 20+
- Credenciales del proyecto Supabase del Centro Deportivo

## Configuración

1. Clonar el repositorio.
2. Crear el archivo de entorno a partir de la plantilla:
   ```bash
   cp .env.example .env
   ```
3. Rellenar `.env` con las credenciales reales de Supabase (URL, publishable key, `DATABASE_URL`).
   **⚠️ Nunca commitear `.env`** — está protegido por `.gitignore`.

## Generación de imágenes (OpenAI)

Script para generar imágenes con `gpt-image-1` (uso local / server-side):

```bash
node --env-file=.env scripts/generate-image.mjs "tu prompt aquí"
# opciones: --size 1024x1024 --quality high --model gpt-image-1 --out generated/mi-imagen.png
```

Requiere `OPENAI_API_KEY` en `.env`. Las imágenes se guardan en `generated/` (ignorada por git).
En la plataforma, la generación irá en una **API route server-side** y las imágenes se persistirán en **Supabase Storage**.

## Notas del proyecto

- `Centro Deportivo AF Design System.zip` — sistema de diseño (colores, tipografías, componentes) a aplicar en la UI.
- `skills-lock.json` — manifiesto de skills de Claude Code usadas en el proyecto (restaurables con `npx skills experimental_install`).
