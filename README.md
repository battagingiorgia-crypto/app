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

## Instalarla en el móvil
Hay que publicarla en una web con HTTPS (p. ej. GitHub Pages: *Settings → Pages → Deploy from branch*).
Luego se abre la dirección en el móvil y: Android/Chrome → menú ⋮ → *Instalar app*; iPhone/Safari → Compartir → *Añadir a pantalla de inicio*.

## Desarrollo
- Probar en local: `python3 -m http.server` y abrir http://localhost:8000
- Tests de la lógica de cálculo: `npm test`

Los datos se guardan en el móvil (localStorage). Para pasarlos a otro móvil: Ajustes → Exportar / Importar.
