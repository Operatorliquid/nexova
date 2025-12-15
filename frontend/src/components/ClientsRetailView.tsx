import React from "react";
import type { ContactLabels } from "../businessConfig";

type PatientViewData = {
  patient: any;
  orders?: Array<{
    id: number;
    sequenceNumber: number;
    status: string;
    totalAmount: number;
    customerName: string;
    customerAddress: string | null;
    customerDni: string | null;
    createdAt: string;
    items: Array<{ id: number; productName: string; quantity: number; unitPrice: number }>;
  }>;
};

type Props = {
  patientViewData: PatientViewData;
  contactLabels: ContactLabels;
  onAddTag?: (patientId: number) => void;
  onRemoveTag?: (patientId: number, tagId: number) => void;
  removingTagId?: number | null;
};

export function ClientsRetailView({
  patientViewData,
  contactLabels,
  onAddTag,
  onRemoveTag,
  removingTagId,
}: Props) {
  const patient = patientViewData.patient;
  const orders = Array.isArray(patientViewData.orders) ? patientViewData.orders : [];
  const [openOrderId, setOpenOrderId] = React.useState<number | null>(null);
  const [ordersVisible, setOrdersVisible] = React.useState(true);
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
  const openOrder = orders.find((o) => o.id === openOrderId) || null;
  const tags = Array.isArray(patient?.tags) ? patient.tags : [];

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const printOrder = (order: (typeof orders)[number]) => {
    if (typeof window === "undefined" || !order) return;

    const createdAt = new Date(order.createdAt);
    const dateLabel = createdAt.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeLabel = createdAt.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td>${item.productName}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">$${item.unitPrice.toLocaleString("es-AR")}</td>
          <td class="num">$${(item.unitPrice * item.quantity).toLocaleString("es-AR")}</td>
        </tr>`
      )
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Pedido #${order.sequenceNumber}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 8px; font-size: 20px; }
            .meta { font-size: 12px; color: #444; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 13px; text-align: left; }
            th { background: #f6f6f6; }
            .num { text-align: right; white-space: nowrap; }
            .total { font-weight: 700; font-size: 14px; text-align: right; margin-top: 12px; }
          </style>
        </head>
        <body>
          <h1>Boleta · Pedido #${order.sequenceNumber}</h1>
          <div class="meta">Creado: ${dateLabel} ${timeLabel} · Estado: ${order.status}</div>
          <div>
            <strong>Cliente:</strong> ${order.customerName || "Cliente WhatsApp"}<br />
            ${order.customerAddress ? `<strong>Dirección:</strong> ${order.customerAddress}<br />` : ""}
            ${order.customerDni ? `<strong>DNI:</strong> ${order.customerDni}<br />` : ""}
          </div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th class="num">Cant.</th>
                <th class="num">Precio</th>
                <th class="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || "<tr><td colspan='4'>Pedido vacío</td></tr>"}
            </tbody>
          </table>
          <div class="total">Total: $${order.totalAmount.toLocaleString("es-AR")}</div>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    setTimeout(() => win.close(), 300);
  };

  const renderTag = (tag: any) => {
    const severityClass =
      tag.severity === "critical"
        ? "bg-rose-900/20 text-rose-100 border border-rose-500/40"
        : tag.severity === "high"
        ? "bg-amber-900/20 text-amber-100 border border-amber-400/40"
        : tag.severity === "medium"
        ? "bg-sky-900/20 text-sky-100 border border-sky-400/40"
        : "bg-emerald-900/20 text-emerald-100 border border-emerald-400/40";
    return (
      <span
        key={`${tag.id}-${tag.label}`}
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-[11px] font-semibold ${severityClass}`}
      >
        {tag.label}
        {onRemoveTag && tag.id > 0 && (
          <button
            type="button"
            className="text-[11px] opacity-70 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveTag(patient.id, tag.id);
            }}
            disabled={removingTagId === tag.id}
          >
            ×
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="rounded-2xl card-surface p-4 md:p-6 space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {patient.fullName || `${contactLabels.singularCapitalized} sin nombre`}
            </h3>
            {onAddTag && (
              <button
                type="button"
                className="text-[11px] px-2.5 py-1 rounded-full border border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                onClick={() => onAddTag(patient.id)}
              >
                + Agregar etiqueta
              </button>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1 mb-2">
              {tags.map(renderTag)}
            </div>
          )}
          <p className="text-sm text-slate-500">
            Teléfono:{" "}
            <span className="font-medium text-slate-800">{patient.phone || "Sin teléfono"}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            { label: "DNI", value: patient.dni },
            { label: "Dirección", value: patient.address },
          ].map((field) => (
            <div
              key={`detail-grid-${field.label}`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">{field.label}</p>
              <p className="font-semibold text-slate-900 leading-tight line-clamp-2">
                {(typeof field.value === "string" && field.value.trim()) || "Pendiente"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-slate-900">Pedidos</h4>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">
              {orders.length === 0
                ? "Sin pedidos todavía"
                : `${orders.length} pedido${orders.length === 1 ? "" : "s"}`}
            </p>
            {orders.length > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:-translate-y-0.5 transition"
                onClick={() => setConfirmClearOpen(true)}
              >
                Limpiar historial
              </button>
            )}
          </div>
        </div>

        {!ordersVisible ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 space-y-3">
            <p>Pedidos ocultos. Podés volver a mostrarlos.</p>
            <div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setOrdersVisible(true)}
              >
                Mostrar pedidos
              </button>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Todavía no registramos pedidos para este cliente.
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const summary =
                order.items
                  .map((it) => `${it.quantity} x ${it.productName}`)
                  .join(" · ") || "Sin ítems";
              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Pedido #{order.sequenceNumber}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">{summary}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{formatDateTime(order.createdAt)}</p>
                      <p className="font-semibold text-slate-900">
                        ${order.totalAmount.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 capitalize">
                    Estado: {order.status === "pending" ? "Falta revisión" : order.status}
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:-translate-y-0.5 transition"
                      onClick={() => setOpenOrderId(order.id)}
                    >
                      Ver pedido
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {openOrderId !== null && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold text-slate-900">Detalle del pedido</h4>
                  <p className="text-sm text-slate-600">
                    {(() => {
                      const ord = orders.find((o) => o.id === openOrderId);
                      if (!ord) return "";
                      return `#${ord.sequenceNumber} · ${formatDateTime(ord.createdAt)}`;
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {openOrder && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => printOrder(openOrder)}
                    >
                      Imprimir boleta
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOpenOrderId(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {(() => {
                const ord = openOrder;
                if (!ord) return <p className="text-sm text-slate-600">Pedido no encontrado.</p>;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span>Cliente: {ord.customerName || "Cliente WhatsApp"}</span>
                      <span className="font-semibold">
                        Total: ${ord.totalAmount.toLocaleString("es-AR")}
                      </span>
                    </div>
                    {ord.customerAddress && (
                      <p className="text-xs text-slate-500">Dirección: {ord.customerAddress}</p>
                    )}
                    <div className="rounded-xl border border-slate-200">
                      <div className="grid grid-cols-4 text-xs font-semibold text-slate-600 px-3 py-2 bg-slate-50">
                        <span className="col-span-2">Producto</span>
                        <span className="text-right">Cant.</span>
                        <span className="text-right">Subtotal</span>
                      </div>
                      <div className="divide-y divide-slate-200 text-sm">
                        {ord.items.map((it) => (
                          <div
                            key={it.id}
                            className="grid grid-cols-4 px-3 py-2 text-slate-800 items-center"
                          >
                            <span className="col-span-2">{it.productName}</span>
                            <span className="text-right">{it.quantity}</span>
                            <span className="text-right">
                              ${(it.quantity * it.unitPrice).toLocaleString("es-AR")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {confirmClearOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-4">
              <div className="space-y-2">
                <h4 className="text-lg font-semibold text-slate-900">Limpiar historial</h4>
                <p className="text-sm text-slate-600">
                  Esto solo oculta los pedidos en esta vista para que sea más liviana. No se borran
                  de la base de datos. ¿Querés continuar?
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmClearOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setOrdersVisible(false);
                    setOpenOrderId(null);
                    setConfirmClearOpen(false);
                  }}
                >
                  Limpiar historial
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
