import type { ContactLabels } from "../businessConfig";

type Consultation = any;
type PatientViewData = {
  patient: any;
  consultations: Consultation[];
};

type Props = {
  patientViewData: PatientViewData;
  contactLabels: ContactLabels;
  formatPatientBirthDate: (date: Date | string | null | undefined) => string;
  getPatientTagBadgeClass: (severity: string) => string;
  handleRemovePatientTag: (patientId: number, tagId: number) => void;
  tagRemovingId: number | null;
  handleOpenTagModal: (id: number) => void;
  consultationStatusMessage: string | null;
  openConsultations: Record<number, boolean>;
  consultationFormState: Record<number, { paymentMethod: string; chargedAmount: string }>;
  consultationStatusUpdating: number | null;
  toggleConsultationCard: (consultationId: number) => void;
  handleConsultationStatusUpdate: (
    consultationId: number,
    status: string,
    extra?: { paymentMethod?: "cash" | "transfer_card"; chargedAmount?: number }
  ) => void;
  setConsultationStatusMessage: (message: string | null) => void;
};

export function ClientsHealthView({
  patientViewData,
  contactLabels,
  formatPatientBirthDate,
  getPatientTagBadgeClass,
  handleRemovePatientTag,
  tagRemovingId,
  handleOpenTagModal,
  consultationStatusMessage,
  openConsultations,
  consultationFormState,
  consultationStatusUpdating,
  toggleConsultationCard,
  handleConsultationStatusUpdate,
  setConsultationStatusMessage,
}: Props) {
  const patient = patientViewData.patient;

  return (
    <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-900">
            {patient.fullName || `${contactLabels.singularCapitalized} sin nombre`}
          </h3>
          {patient.isProfileComplete === false && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              ⚠︎ Ficha incompleta
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Teléfono: <span className="font-medium text-slate-800">{patient.phone || "Sin teléfono"}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        {[
          { label: "DNI", value: patient.dni },
          {
            label: "Fecha de nacimiento",
            value: formatPatientBirthDate(patient.birthDate),
            treatAsFormatted: true,
          },
          {
            label: "Dirección",
            value: patient.address,
          },
          {
            label: "Obra social",
            value: patient.insuranceProvider,
          },
        ].map((field) => (
          <div key={`detail-grid-${field.label}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{field.label}</p>
            <p className="font-semibold text-slate-900 leading-tight line-clamp-2">
              {field.treatAsFormatted
                ? field.value
                : (typeof field.value === "string" && field.value.trim()) || "Pendiente"}
            </p>
          </div>
        ))}
      </div>

      <div className="pt-2">
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Datos importantes</p>
        <div className="flex flex-wrap gap-1">
          {patient.tags && patient.tags.length > 0 ? (
            patient.tags.map((tag: any) => (
              <span
                key={`detail-tag-${tag.id}`}
                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border inline-flex items-center gap-1 ${getPatientTagBadgeClass(
                  tag.severity
                )}`}
              >
                {tag.label}
                <button
                  type="button"
                  className="text-[10px] opacity-80 hover:opacity-100"
                  onClick={() => handleRemovePatientTag(patient.id, tag.id)}
                  disabled={tagRemovingId === tag.id}
                  aria-label="Eliminar etiqueta"
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">Sin etiquetas cargadas para este paciente.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => handleOpenTagModal(patient.id)} className="btn btn-outline btn-sm">
            Agregar dato importante
          </button>
        </div>
      </div>

      <div className="rounded-2xl card-surface">
        <div className="p-4 md:p-6 text-sm text-slate-600">
          {patientViewData.consultations.length === 0 ? (
            <p className="text-slate-500">
              Todavía no registramos consultas para este {contactLabels.singularLower || "paciente"}.
            </p>
          ) : (
            <div className="space-y-3">
              {consultationStatusMessage && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {consultationStatusMessage}
                </div>
              )}
              {patientViewData.consultations.map((c: any) => {
                const date = new Date(c.dateTime);
                const dateLabel = date.toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                });
                const timeLabel = date.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const isOpen = !!openConsultations[c.id];
                const formState = consultationFormState[c.id] || {
                  paymentMethod: "",
                  chargedAmount: "",
                };
                const isCancelled =
                  c.status === "cancelled" ||
                  c.status === "cancelled_by_patient" ||
                  c.status === "cancelled_by_doctor" ||
                  c.status === "canceled";
                const isRescheduled = c.status === "rescheduled";
                const statusLabel = isCancelled
                  ? "CANCELADO"
                  : isRescheduled
                  ? "REPROGRAMADO"
                  : c.status === "completed"
                  ? "FINALIZADA"
                  : c.status === "incomplete"
                  ? "INCOMPLETA"
                  : "PENDIENTE";
                const statusBadgeClass = isCancelled
                  ? "bg-[#451320] text-rose-100 border border-rose-400/70 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                  : isRescheduled
                  ? "bg-[#102437] text-sky-100 border border-sky-400/70 shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                  : c.status === "completed"
                  ? "bg-[#0f2b1f] text-emerald-100 border border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                  : c.status === "incomplete"
                  ? "bg-[#3c2c0d] text-amber-100 border border-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  : "bg-[#1f1f1f] text-slate-200 border border-slate-500/40";
                const paymentSummary = c.paymentMethod
                  ? c.paymentMethod === "cash"
                    ? "Pago en efectivo"
                    : "Transferencia / Débito / Crédito"
                  : "Sin registrar";
                const amountSummary = typeof c.chargedAmount === "number" ? `$ ${c.chargedAmount.toLocaleString("es-AR")}` : "—";
                const finalizeDisabled = consultationStatusUpdating === c.id;
                const handleFinalize = () => {
                  const method = formState.paymentMethod;
                  if (!method) {
                    setConsultationStatusMessage("Elegí la forma de pago antes de finalizar la consulta.");
                    return;
                  }
                  const amountNumber = Number(formState.chargedAmount);
                  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
                    setConsultationStatusMessage("Ingresá un monto válido para finalizar la consulta.");
                    return;
                  }
                  handleConsultationStatusUpdate(c.id, "completed", {
                    paymentMethod: method as "cash" | "transfer_card",
                    chargedAmount: amountNumber,
                  });
                };
                const handleMarkIncomplete = () => handleConsultationStatusUpdate(c.id, "incomplete");

                return (
                  <div key={c.id} className="border border-slate-200 rounded-xl">
                    <button
                      type="button"
                      onClick={() => toggleConsultationCard(c.id)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                    >
                      <div>
                        <p className="text-xs text-slate-500">
                          {dateLabel} · {timeLabel}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          Turno {dateLabel} · {timeLabel}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-1">
                          Motivo: <span className="font-medium text-slate-800">{c.type?.trim() || "Sin detalle"}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusBadgeClass}`}>
                          {statusLabel}
                        </span>
                        <span className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-200 bg-slate-50 px-3 py-3 space-y-3 text-sm text-slate-700">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <p className="text-[11px] text-slate-500 uppercase">Estado</p>
                            <p className="font-semibold text-slate-900">{statusLabel}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 uppercase">Pago</p>
                            <p className="font-semibold text-slate-900">{paymentSummary}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 uppercase">Monto</p>
                            <p className="font-semibold text-slate-900">{amountSummary}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 uppercase">Duración</p>
                            <p className="font-semibold text-slate-900">{c.durationMinutes ? `${c.durationMinutes} min` : "—"}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="text-xs text-slate-600 space-y-1">
                            <span>Forma de pago</span>
                            <select
                              value={formState.paymentMethod}
                              onChange={(e) =>
                                handleConsultationStatusUpdate(c.id, "draft", {
                                  paymentMethod: e.target.value as "cash" | "transfer_card",
                                  chargedAmount: formState.chargedAmount ? Number(formState.chargedAmount) : undefined,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            >
                              <option value="">Seleccionar</option>
                              <option value="cash">Efectivo</option>
                              <option value="transfer_card">Transferencia / Débito / Crédito</option>
                            </select>
                          </label>
                          <label className="text-xs text-slate-600 space-y-1">
                            <span>Monto cobrado</span>
                            <input
                              type="number"
                              value={formState.chargedAmount}
                              onChange={(e) =>
                                handleConsultationStatusUpdate(c.id, "draft", {
                                  paymentMethod: formState.paymentMethod as "cash" | "transfer_card",
                                  chargedAmount: Number(e.target.value),
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                              placeholder="0"
                              min="0"
                              step="50"
                            />
                          </label>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleFinalize}
                            disabled={finalizeDisabled}
                          >
                            {finalizeDisabled ? "Guardando..." : "Finalizar"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={handleMarkIncomplete}
                            disabled={consultationStatusUpdating === c.id}
                          >
                            Marcar incompleta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
