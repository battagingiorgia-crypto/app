# 💧 Agua del Piso

App móvil (PWA) para repartir entre 5 personas la factura trimestral del agua.

## Funciones
- **Calendario**: en cada día se apunta, por persona, las noches de visita 🏠 y las lavadoras 🧺.
  Abajo se ve cuántas lavadoras lleva cada persona esa semana (en naranja si se pasa del límite).
- **Factura**: introduces fechas e importe → la app calcula cuánto paga cada una y explica el cálculo. Se guarda en el historial.
- **Ajustes**: nombres, coste por visita, lavadoras gratis por semana, % de recargo, exportar/importar datos.

## Cómo se calcula
1. Cada noche de visita suma **0,40 €** a quien la tuvo.
2. El resto de la factura se reparte entre las 5 con un peso: `peso = 1 + (% / 100) × lavadoras_extra`.
   Las lavadoras extra son las que superan **2 por semana** (lunes–domingo).
3. Los céntimos se ajustan para que la suma sea exactamente el importe de la factura.

Recargo recomendado: **1 % por lavadora extra** (una lavadora gasta ~50 L ≈ 0,10–0,15 € de agua,
que es más o menos el 0,5–1 % de la parte de cada una en una factura de ~150 €).

## Base de datos compartida (Firebase) — configuración (una sola vez, ~10 min)
Sin configurar, la app funciona en **modo local** (datos solo en un móvil). Para que las 5 veáis lo mismo:

1. Entra en https://console.firebase.google.com con una cuenta de Google → **Crear proyecto** (p. ej. `agua-piso`).
   Puedes desactivar Google Analytics; no hace falta.
2. Menú **Compilación → Firestore Database → Crear base de datos** → ubicación `eur3 (europe-west)` → **modo producción**.
3. En Firestore, pestaña **Reglas**: borra lo que hay, pega el contenido de `firestore.rules` y pulsa **Publicar**.
4. Rueda ⚙️ → **Configuración del proyecto** → *Tus apps* → icono **</>** (web) → pon un nombre → **Registrar app**.
   Te enseña un objeto `firebaseConfig = { apiKey: ..., projectId: ..., ... }`.
5. Copia ese objeto en `firebase-config.js` (sustituyendo `null`) y súbelo al repositorio.
6. Publica la app (ver abajo), ábrela, pulsa **Crear un piso nuevo** y en Ajustes → **Compartir enlace** envíalo al grupo.

¿Es seguro poner `apiKey` en el código? Sí: en Firebase no es una contraseña, solo identifica el proyecto.
Lo que protege los datos son las reglas (`firestore.rules`): nadie puede ver la lista de pisos, y para leer o
escribir un piso hay que conocer su código de 20 caracteres aleatorios (que va dentro del enlace). Por eso
**no publiquéis el enlace** fuera del grupo del piso.

Cómo se sincroniza:
- Cada toque en + / − se envía con `increment()`, que suma en el servidor: si dos personas pulsan a la vez, cuentan las dos.
- Sin conexión se puede seguir apuntando; los cambios se suben solos al volver internet (indicador arriba a la derecha).
- Coste: el plan gratuito (Spark) permite 50.000 lecturas y 20.000 escrituras al día; un piso usa unas pocas decenas.

## Instalarla en el móvil
Hay que publicarla en una web con HTTPS (p. ej. GitHub Pages: *Settings → Pages → Deploy from branch*).
Luego se abre la dirección en el móvil y: Android/Chrome → menú ⋮ → *Instalar app*; iPhone/Safari → Compartir → *Añadir a pantalla de inicio*.

## Desarrollo
- Probar en local: `python3 -m http.server` y abrir http://localhost:8000
- Tests de la lógica de cálculo: `npm test`

- Probar la sincronización sin internet: `npx firebase-tools emulators:start --only firestore --project demo-agua`
  y en `firebase-config.js` poner `emulatorHost = '127.0.0.1:8080'` y un `firebaseConfig` con `projectId: 'demo-agua'`.

### Archivos
- `calc.js` – lógica del reparto (con tests en `tests/`)
- `store.js` – datos: modo local (localStorage) o compartido (Firestore)
- `app.js` – interfaz · `firebase-config.js` – tu configuración · `firestore.rules` – reglas de seguridad
