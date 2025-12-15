import React from "react";
import type { ContactLabels } from "../businessConfig";

type Patient = any;

type Props = {
  patients: Patient[];
  patientStats: { total: number; pendingInsurance: number; pendingReason: number };
  contactLabels: ContactLabels;
  patientSearch: string;
  setPatientSearch: (value: string) => void;
  patientsError: string | null;
  loadingPatients: boolean;
  getPatientTagBadgeClass: (severity: string) => string;
  handleOpenPatientDetail: (id: number) => void;
  handleOpenPatientChat: (id: number) => void;
  handleOpenTagModal: (id: number) => void;
};

export function ClientsHealthList({
  patients,
  patientStats,
  contactLabels,
  patientSearch,
  setPatientSearch,
  patientsError,
  loadingPatients,
  getPatientTagBadgeClass,
  handleOpenPatientDetail,
  handleOpenPatientChat,
  handleOpenTagModal,
}: Props) {
  const filtered = React.useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const query = patientSearch.trim().toLowerCase();
    return patients.filter((p) => {
      const name = p.fullName?.toLowerCase() || "";
      const phone = p.phone?.toLowerCase() || "";
      const insurance = p.insuranceProvider?.toLowerCase() || "";
      const reason = p.consultReason?.toLowerCase() || "";
      return (
        name.includes(query) ||
        phone.includes(query) ||
        insurance.includes(query) ||
        reason.includes(query)
      );
    });
  }, [patients, patientSearch]);

  return (
    <>
      <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {contactLabels.plural} de WhatsApp
            </h2>
            <p className="text-sm text-slate-500">
              Listado filtrado por tu cuenta. Buscá por nombre, número u obra social.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
              <p className="text-slate-500">Total</p>
              <p className="text-base font-semibold text-slate-900">
                {patientStats.total}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
              <p className="text-slate-500">Obra social pendiente</p>
              <p className="text-base font-semibold text-slate-900">
                {patientStats.pendingInsurance}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
              <p className="text-slate-500">Motivo pendiente</p>
              <p className="text-base font-semibold text-slate-900">
                {patientStats.pendingReason}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder={`Buscar ${contactLabels.pluralLower} por nombre, teléfono o nota`}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
          />
          {patientsError && <p className="text-xs text-rose-600">{patientsError}</p>}
          {loadingPatients && (
            <p className="text-xs text-slate-500">
              Cargando {contactLabels.pluralLower}...
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {filtered.length === 0 && !loadingPatients && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
            {patientSearch.trim()
              ? `No encontramos ${contactLabels.pluralLower} que coincidan con “${patientSearch}”.`
              : `Todavía no registramos ${contactLabels.pluralLower} desde WhatsApp.`}
          </div>
        )}

        {filtered.map((p) => {
          const missingInsurance = !(p.insuranceProvider || "").trim();
          const missingReason = !(p.consultReason || "").trim();

          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpenPatientDetail(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenPatientDetail(p.id);
                }
              }}
              className="rounded-2xl card-surface px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 cursor-pointer transition-all hover:-translate-y-0.5"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    {p.fullName || `${contactLabels.singularCapitalized} sin nombre`}
                  </h3>
                  {missingInsurance || missingReason ? (
                    <span className="text-[11px] uppercase tracking-wide bg-[#3b2507] text-amber-100 px-2 py-0.5 rounded-full border border-amber-400/60">
                      Datos incompletos
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  {p.phone || "Sin teléfono registrado"}
                </p>
                <div className="text-xs text-slate-600 mt-2">
                  <p>
                    <span className="text-slate-400">Obra social:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {p.insuranceProvider?.trim() || "Pendiente"}
                    </span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.tags && p.tags.length > 0 ? (
                    p.tags.map((tag: any) => (
                      <span
                        key={`list-tag-${p.id}-${tag.id}`}
                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${getPatientTagBadgeClass(
                          tag.severity
                        )}`}
                      >
                        {tag.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Sin datos importantes
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPatientChat(p.id);
                  }}
                  className="btn btn-outline btn-sm"
                >
                  Abrir chat
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenTagModal(p.id);
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Etiquetar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
