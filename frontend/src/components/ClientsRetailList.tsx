import React from "react";
import type { ContactLabels } from "../businessConfig";

type Patient = any;

type Props = {
  patients: Patient[];
  contactLabels: ContactLabels;
  patientStats: { total: number };
  patientSearch: string;
  setPatientSearch: (value: string) => void;
  patientsError: string | null;
  loadingPatients: boolean;
  handleOpenPatientDetail: (id: number) => void;
  handleOpenPatientChat: (id: number) => void;
};

export function ClientsRetailList({
  patients,
  contactLabels,
  patientStats,
  patientSearch,
  setPatientSearch,
  patientsError,
  loadingPatients,
  handleOpenPatientDetail,
  handleOpenPatientChat,
}: Props) {
  const filtered = React.useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const query = patientSearch.trim().toLowerCase();
    return patients.filter((p) => {
      const name = p.fullName?.toLowerCase() || "";
      const phone = p.phone?.toLowerCase() || "";
      return name.includes(query) || phone.includes(query);
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
              Listado filtrado por tu cuenta. Buscá por nombre o número.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
              <p className="text-slate-500">Total</p>
              <p className="text-base font-semibold text-slate-900">
                {patientStats.total}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder={`Buscar ${contactLabels.pluralLower} por nombre o número`}
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

        {filtered.map((p) => (
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
              </div>
              <p className="text-xs text-slate-500">
                {p.phone || "Sin teléfono registrado"}
              </p>
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
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
