# GuÃ­a de despliegue - CRM Inmobiliario

Todo el sistema corre en un Ãºnico servidor (Contabo) tras un solo dominio:

  Dominio:      https://crm.dunacon.pe
  VPS (Nginx):  209.145.62.118  (A record ya apuntando al VPS)
  Frontend:     Next.js (export estÃ¡tico servido por Nginx desde ./nginx/html)
  Backend:      Nest en Docker (contenedor crm_backend:3001, red interna)
  Base de datos: Supabase (Postgres). Imagenes: Cloudinary.

Flujo
  Cliente -> https://crm.dunacon.pe                 (Nginx sirve el frontend estÃ¡tico)
                     fetch /axios (rutas /api/*)
                     v
             https://crm.dunacon.pe/api/*            (Nginx proxye al backend)
                     v
             contenedor crm_backend:3001 (Nest, red interna Docker)
                     v
             Supabase (Postgres) | Cloudinary (imagenes) | Socket.IO (/socket.io)

El frontend llama por rutas RELATIVAS (/api, /uploads, /socket.io) y Nginx
proxye cada una al backend. Por eso TODO funciona bajo https://crm.dunacon.pe.

## A) Variables de entorno (Contabo)

Crea .env en la raiz del repo (donde vive docker-compose.yml). NO lo subas a git.

  # Supabase / Pooler
  DB_HOST=aws-0-us-west-2.pooler.supabase.com
  DB_PORT=5432
  DB_USER=postgres.<tu-ref>
  DB_PASSWORD=<password>
  DB_NAME=postgres
  DB_SSL=true

  # API
  JWT_SECRET=<secreto_largo_aleatorio>
  JWT_EXPIRES_IN=1d
  FRONTEND_URL=https://crm.dunacon.pe     # se aÃ±ade a los origenes CORS

  # Cloudinary
  CLOUDINARY_CLOUD_NAME=<cloud_name>
  CLOUDINARY_API_KEY=<api_key>
  CLOUDINARY_API_SECRET=<api_secret>

El docker-compose exige con ${VAR:?}: DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET,
CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. Sin .env no inicia (a proposito).

## B) Contabo - frontend + backend + nginx

  ssh -i ~/.ssh/id_contabo ubuntu@209.145.62.118
  cd ~/crm                      # clona tu repo y crea .env (paso A)
  nano .env

1) Construye el FRONTEND sobre el VPS (o local) y copia el export estÃ¡tico a Nginx:

  cd frontend
  NEXT_PUBLIC_API=https://crm.dunacon.pe npm run build   # genera ./out (export estÃ¡tico)
  rm -rf ../nginx/html && cp -r out ../nginx/html        # Nginx sirve /var/www/html

2) Levanta docker (backend + nginx):

  docker compose up -d --build
  docker compose ps             # backend + nginx

El contenedor backend aplica migraciones contra Supabase y escucha en :3001 en la red
interna de Docker (no expuesto al publico). El contenedor nginx escucha 80/443, sirve
el frontend estÃ¡tico y proxye /api, /uploads y /socket.io hacia backend:3001.

## C) Nginx + Certbot (HTTPS crm.dunacon.pe)

El repo trae config inicial HTTP + desafio ACME en nginx/site.conf y la config SSL
lista en nginx/site-ssl.conf (inactiva hasta que existan certificados).

Preparar carpeta webroot (montada como /var/www/html y sirve el frontend):
  mkdir -p ~/crm/nginx/html

1) Levanta primero (config HTTP 80) reciÃ©n con el build estÃ¡tico copiado (paso B1).

2) Emite el certificado con Certbot en el host (requiere certbot instalado):
  docker compose stop nginx        # libera 80
  sudo certbot certonly --standalone -d crm.dunacon.pe \
       --register-unsafely-without-email --agree-tos
  docker compose start nginx

   > Si no puedes detener 80, usa --webroot -w ~/crm/nginx/html
     mientras nginx siga activo respondiendo /.well-known.

3) Activa HTTPS usando los certificados de Let's Encrypt del host:
  cp nginx/site-ssl.conf nginx/site.conf
  docker compose restart nginx

4) DNS: crm.dunacon.pe (A) -> 209.145.62.118 (Contabo)  -> Nginx atiende front+api.

5) Verifica:
  curl -I https://crm.dunacon.pe            # 200 (frontend)
  curl -I https://crm.dunacon.pe/api/health # 200/404 (proxy API OK, ver ruta real)

## D) Migraciones contra Supabase

  docker compose up -d backend
  docker compose logs backend   # "Migraciones OK - arrancando API..."

Las migraciones corren en cada arranque y son idempotentes. Supabase gestiona la BD;
resetea esquema desde el SQL editor de Supabase, no por SSH.

## Notas de seguridad
- Ningun secreto en codigo ni en compose versionado: usar solo .env.
- Nunca expones backend:3001 al publico ni la BD; solo crm.dunacon.pe por Nginx.
- Rota credenciales si quedaron en mensajes/logs historicos o se publico el repo.
