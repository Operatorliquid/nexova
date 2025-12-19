Manual sanity flows (simular por WhatsApp):

1) Comprobante → bot: “¿Es para el pedido #N?” → usuario: “sí” / “no” / “N” / “¿qué?”; esperar asignación o clarificación sin desviar a stock.
2) Catálogo → bot ofrece → usuario: “sí” / “no” / “?”; debe enviar o cerrar sin bucle.
3) Ubicación → “¿Dónde queda…?” → bot pregunta “¿te comparto ubicación?” → usuario: “sí/no/?”; responder y limpiar estado.
4) Falta de mapeo → “quiero 2 galletitas” (sin nombre exacto) → bot ofrece opciones → usuario: “2” o “2 x 3” → se agrega; “no” aborta; “?” repregunta.
5) Falta stock al armar → pedir cantidades mayores al stock → bot informa faltantes (stock_replacement) → usuario: “ok”/“no”/reemplazo; no debe ir a parser de stock.
6) Falta stock al confirmar → con pedido pendiente sin stock suficiente → al confirmar, bot informa faltantes y guarda estado; “ok” cierra o reemplaza según respuesta.
7) Pregunta genérica “¿qué bebidas tenés?” → lista opciones (catálogo); no confunde con pedidos.
8) Pregunta ubicación después de otro hilo (ej: tras comprobante) → debe priorizar la nueva pregunta o aclarar, sin perderse.
