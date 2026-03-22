# Acceso remoto: SSH desde casa y URL estable con Cloudflare

## 1. SSH desde el PC de casa (editar código en el servidor)

### Qué ya tienes en el servidor Windows

- **OpenSSH Server (`sshd`)** instalado y en ejecución.
- **Firewall de Windows**: suelen existir reglas *OpenSSH Server (sshd)* para el puerto **TCP 22**.

### Paso A — Arranque automático y firewall (en el PC servidor)

Ejecuta **una vez** como **administrador** (clic derecho en PowerShell → *Ejecutar como administrador*):

```powershell
Set-Location C:\Users\PC\Documents\Sunday
powershell -ExecutionPolicy Bypass -File .\ops\ssh-servidor-preparar.ps1
```

Eso deja **`sshd` en inicio automático** y activa las reglas de firewall locales.

### Paso B — Cómo llegar desde casa hasta el puerto 22

El firewall del PC **no basta**: desde otra red, el tráfico debe **llegar** a tu router y a tu PC.

| Opción | Estabilidad | Qué hacer |
|--------|-------------|-----------|
| **Tailscale (recomendado)** | Muy buena | Instala [Tailscale](https://tailscale.com/) en el **servidor** y en el **PC de casa**. Entonces SSH va a la IP Tailscale del servidor (`100.x.x.x`), sin abrir el 22 en el router. |
| **Reenvío de puerto (NAT)** | Depende del ISP/router | En el router de la oficina, reenvía **TCP 22** (u otro, p. ej. 2222) a la IP **LAN** del PC servidor. Desde casa: `ssh -p 2222 usuario@IP_PUBLICA`. Cambia contraseñas débiles y **prefiere solo llave SSH**. |
| **Solo misma Wi‑Fi** | N/A para “casa” | `ssh usuario@192.168.x.x` funciona solo si estás en la misma red. |

### Paso C — Solo llave SSH (obligatorio si expones SSH a Internet)

1. **En el PC de casa:**

   ```powershell
   ssh-keygen -t ed25519 -C "casa-cursor"
   ```

2. Copia el contenido de `~/.ssh/id_ed25519.pub`.

3. **En el servidor**, crea o edita (con tu usuario Windows):

   `C:\Users\TU_USUARIO\.ssh\authorized_keys`

   Una línea = una clave pública.

4. Permisos en Windows para `authorized_keys`: [documentación Microsoft OpenSSH](https://learn.microsoft.com/windows-server/administration/openssh/openssh_keymanagement).

5. Prueba desde casa:

   ```powershell
   ssh TU_USUARIO@100.x.x.x
   ```

   (sustituye por la IP Tailscale o la IP pública y el puerto que uses).

### Paso D — Cursor en casa

1. Instala la extensión **Remote - SSH**.
2. `Ctrl+Shift+P` → **Remote-SSH: Open SSH Configuration File** → edita `~/.ssh/config`:

   ```ssh-config
   Host sunday-servidor
       HostName 100.x.x.x
       User TU_USUARIO_WINDOWS
       Port 22
   ```

3. **Remote-SSH: Connect to Host** → `sunday-servidor` → **Abrir carpeta** `C:\Users\PC\Documents\Sunday`.

---

## 2. URL de Cloudflare que “no se cae” y no cambia cada día

### La verdad sobre Quick Tunnel (`*.trycloudflare.com`)

- Es **gratis y rápido**, pero Cloudflare **no garantiza** disponibilidad ni una URL fija.
- **Cada vez que reinicias** `cloudflared tunnel --url …` suele salir **otra** URL.
- Para la app Sunday ya tienes **`ALLOW_TRYCLOUDFLARE_ORIGINS=1`**, que acepta cualquier `https://*.trycloudflare.com` sin reeditar `.env` en cada reinicio — pero la **URL que compartes** sigue cambiando si reinicias el túnel.

**Nadie puede prometer que un Quick Tunnel concreto no “caerá”**; es el diseño del producto gratuito.

### Solución profesional: túnel nombrado + dominio en Cloudflare

Obtienes **`https://sunday.tudominio.com`** (fija) y puedes ejecutar `cloudflared` como **servicio de Windows** para que suba con el equipo.

Requisitos:

1. Cuenta **Cloudflare** y un **dominio** gestionado por Cloudflare (DNS en Cloudflare).
2. `cloudflared` instalado en el servidor.

Pasos (resumen; detalle en [documentación oficial](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)):

```powershell
cloudflared tunnel login
cloudflared tunnel create sunday-app
```

Anota el **UUID** del túnel. Descarga/guarda el JSON de credenciales en `%USERPROFILE%\.cloudflared\`.

Copia `ops/cloudflared-named-tunnel.example.yml` a `%USERPROFILE%\.cloudflared\config.yml`, reemplaza `TUNNEL_UUID_REEMPLAZAR` y `sunday.tudominio.com`.

```powershell
cloudflared tunnel route dns sunday-app sunday.tudominio.com
cloudflared tunnel run sunday-app
```

Cuando funcione, instala servicio (consola **administrador**):

```powershell
cloudflared service install
net start cloudflared
```

En **`backend/.env`**:

- Añade `https://sunday.tudominio.com` a **`ALLOWED_ORIGINS`**.
- Puedes dejar o quitar **`ALLOW_TRYCLOUDFLARE_ORIGINS`** según si aún usas Quick Tunnel en paralelo.

En **`frontend/.env`** (solo si usas `npm run dev` contra ese hostname):

```env
VITE_TUNNEL_ALLOWED_HOSTS=sunday.tudominio.com
```

### Resumen

| Necesidad | Qué usar |
|-----------|----------|
| SSH desde casa sin tocar el router | **Tailscale** + script `ops/ssh-servidor-preparar.ps1` + llaves SSH |
| URL HTTPS fija para Sunday | **Túnel nombrado** + dominio Cloudflare + `cloudflared` como servicio |
| Prueba rápida sin dominio | Quick Tunnel (URL variable; `ALLOW_TRYCLOUDFLARE_ORIGINS=1` en backend) |
