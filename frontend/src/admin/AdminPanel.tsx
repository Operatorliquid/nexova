import { useCallback, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../config";
import { type BusinessType } from "../businessConfig";

type ServiceStatus = {
  ok: boolean;
  message: string;
  latencyMs?: number | null;
  checkedAt?: string | null;
};

type AdminNumber = {
  id: string;
  displayPhoneNumber: string;
  status: "available" | "reserved" | "assigned";
  assignedDoctorId: number | null;
  assignedDoctor?: {
    id: number;
    name: string;
    email: string;
  } | null;
  businessType: BusinessType;
};

const ADMIN_KEY_STORAGE = "med-assist-admin-key";

type NumberFormState = {
  displayPhoneNumber: string;
  status: AdminNumber["status"];
  businessType: BusinessType;
};

const defaultForm: NumberFormState = {
  displayPhoneNumber: "",
  status: "available",
  businessType: "HEALTH",
};

function formatDisplay(value: string) {
  return value.replace(/^whatsapp:/i, "");
}

function AdminPanel() {
  const [adminKey, setAdminKey] = useState<string>(
    () => localStorage.getItem(ADMIN_KEY_STORAGE) || ""
  );
  const [numbers, setNumbers] = useState<AdminNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [keyInput, setKeyInput] = useState(adminKey);
  const [serviceStatus, setServiceStatus] = useState<{
    openai: ServiceStatus;
    twilio: ServiceStatus;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [activeBusinessType, setActiveBusinessType] =
    useState<BusinessType>("HEALTH");

  const isAuthenticated = useMemo(() => adminKey.trim().length > 0, [adminKey]);

  const fetchNumbers = useCallback(async () => {
    if (!adminKey) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        buildApiUrl("/api/admin/whatsapp-numbers"),
        {
          headers: {
            "x-admin-key": adminKey,
          },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No se pudo obtener la lista.");
      }

      const json = await res.json();
      setNumbers(json);
    } catch (err: any) {
      console.error("Error al cargar números:", err);
      setError(err?.message || "No pudimos cargar la lista de números.");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  const fetchServiceStatus = useCallback(async () => {
    if (!adminKey) return;
    try {
      setStatusLoading(true);
      setStatusError(null);
      const res = await fetch(
        buildApiUrl("/api/admin/services/status"),
        {
          headers: {
            "x-admin-key": adminKey,
          },
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos verificar los servicios.");
      }
      const json = await res.json();
      setServiceStatus(json);
    } catch (err: any) {
      console.error("Error al obtener estado de servicios:", err);
      setStatusError(err?.message || "No pudimos verificar los servicios.");
      setServiceStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNumbers();
    fetchServiceStatus();
  }, [isAuthenticated, fetchNumbers, fetchServiceStatus]);

  const handleSubmitKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setAdminKey(trimmed);
    localStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
  };

  const handleLogout = () => {
    setAdminKey("");
    setKeyInput("");
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    setNumbers([]);
    setServiceStatus(null);
    setStatusError(null);
  };

  const handleNumberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey || saving) return;

    if (!form.displayPhoneNumber.trim()) {
      setError("Completá el número de WhatsApp (formato whatsapp:+549...).");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch(
        buildApiUrl("/api/admin/whatsapp-numbers"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({
            displayPhoneNumber: form.displayPhoneNumber.trim(),
            status: form.status,
            businessType: form.businessType,
          }),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No se pudo registrar el número.");
      }

      setForm({ ...defaultForm, businessType: activeBusinessType });
      await fetchNumbers();
    } catch (err: any) {
      console.error("Error al guardar número:", err);
      setError(err?.message || "No se pudo guardar el número.");
    } finally {
      setSaving(false);
    }
  };

  const assignationLabel = (number: AdminNumber) => {
    if (number.status === "available") return "Disponible";
    if (number.status === "reserved") return "Reservado";
    if (number.assignedDoctor) {
      return `Asignado a ${number.assignedDoctor.name}`;
    }
    return "Asignado";
  };

  const filteredNumbers = numbers.filter(
    (n) => n.businessType === activeBusinessType
  );

  const businessTypeLabel =
    activeBusinessType === "HEALTH"
      ? "Servicios de salud"
      : "Comercios / retail";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <aside className="hidden md:flex flex-col w-64 bg-white/80 backdrop-blur-md border-r border-slate-200 px-6 py-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-semibold flex items-center justify-center">
            AD
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Admin Panel
            </p>
            <p className="text-xs text-slate-500">Gestión de números</p>
          </div>
        </div>
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
          Navegación
        </div>
        <button className="px-3 py-2 rounded-xl bg-slate-900 text-white text-left text-sm shadow-soft">
          Dashboard
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 md:h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 md:px-8">
          <div className="text-sm md:text-base font-semibold text-slate-800">
            Panel administrador
          </div>
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100"
            >
              Salir
            </button>
          )}
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 space-y-6">
          {!isAuthenticated ? (
            <section className="max-w-xl mx-auto bg-white rounded-2xl shadow-soft border border-slate-100 p-6">
              <h2 className="text-lg font-semibold mb-2">
                Ingresá la clave de administrador
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Esta clave solo la conocen los responsables del proyecto. Con
                ella vas a poder cargar y liberar números de Twilio.
              </p>
              <form className="space-y-3" onSubmit={handleSubmitKey}>
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                  placeholder="Clave secreta"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-slate-900 text-white py-2 text-sm font-medium"
                >
                  Entrar
                </button>
              </form>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-100 bg-white shadow-soft p-5 space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Estado de integraciones</h2>
                    <p className="text-sm text-slate-500">
                      Monitor real-time de la conexión con OpenAI y Twilio.
                    </p>
                  </div>
                  <button
                    onClick={fetchServiceStatus}
                    disabled={statusLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {statusLoading ? "Verificando..." : "Revisar estado"}
                  </button>
                </div>
                {statusError && (
                  <p className="text-xs text-rose-600">{statusError}</p>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <ServiceStatusCard
                    title="OpenAI"
                    status={serviceStatus?.openai}
                    loading={statusLoading}
                    accent="from-violet-500 via-indigo-500 to-slate-900"
                  />
                  <ServiceStatusCard
                    title="Twilio"
                    status={serviceStatus?.twilio}
                    loading={statusLoading}
                    accent="from-emerald-500 via-teal-500 to-slate-900"
                  />
                </div>
              </section>

              <section className="bg-white rounded-2xl shadow-soft border border-slate-100 p-5">
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Números conectados
                      </h2>
                      <p className="text-sm text-slate-500">
                        Gestioná la pool de senders de Twilio segmentada por vertical.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
                        {[
                          { key: "HEALTH", label: "Servicios de salud" },
                          { key: "RETAIL", label: "Comercios" },
                        ].map((tab) => {
                          const active = activeBusinessType === tab.key;
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => {
                                setActiveBusinessType(tab.key as BusinessType);
                                setForm((prev) => ({
                                  ...prev,
                                  businessType: tab.key as BusinessType,
                                }));
                              }}
                              className={`px-3 py-1.5 transition ${
                                active
                                  ? "bg-slate-900 text-white"
                                  : "bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={fetchNumbers}
                        className="text-xs px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                        disabled={loading}
                      >
                        {loading ? "Actualizando..." : "Actualizar"}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Los números de <span className="font-semibold">{businessTypeLabel}</span> solo se muestran a cuentas de ese segmento.
                  </p>
                </div>
                {error && (
                  <p className="text-xs text-rose-600 mb-3">{error}</p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                        <th className="py-2 pr-3">Número</th>
                        <th className="py-2 pr-3">Segmento</th>
                        <th className="py-2 pr-3">Estado</th>
                        <th className="py-2">Asignado a</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNumbers.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-4 text-center text-slate-500 text-xs"
                          >
                            Todavía no cargaste números en esta vertical.
                          </td>
                        </tr>
                      )}
                      {filteredNumbers.map((number) => (
                        <tr
                          key={number.id}
                          className="border-b border-slate-100 text-sm"
                        >
                          <td className="py-2 pr-3 font-medium text-slate-900">
                            {formatDisplay(number.displayPhoneNumber)}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="px-2 py-0.5 rounded-full text-[11px] border border-slate-200 bg-slate-50 text-slate-700">
                              {number.businessType === "HEALTH" ? "Salud" : "Retail"}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                number.status === "available"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : number.status === "reserved"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {number.status}
                            </span>
                          </td>
                          <td className="py-2 text-slate-500">
                            {assignationLabel(number)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white rounded-2xl shadow-soft border border-slate-100 p-5">
                <h2 className="text-lg font-semibold mb-2">
                  Cargar nuevo número
                </h2>
                <p className="text-sm text-slate-500 mb-4">
                  Pega el número de Twilio tal como aparece en el panel (con
                  prefijo +54, etc.) y el Phone Number ID que te brinda Twilio.
                </p>
                <form className="grid md:grid-cols-3 gap-3" onSubmit={handleNumberSubmit}>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Número de WhatsApp
                    </label>
                    <input
                      type="text"
                      name="displayPhoneNumber"
                      value={form.displayPhoneNumber}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          displayPhoneNumber: e.target.value,
                        }))
                      }
                      placeholder="whatsapp:+549..."
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Estado inicial
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          status: e.target.value as typeof form.status,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    >
                      <option value="available">Disponible</option>
                      <option value="reserved">Reservado</option>
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Segmento
                    </label>
                    <select
                      value={form.businessType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          businessType: e.target.value as BusinessType,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    >
                      <option value="HEALTH">Servicios de salud</option>
                      <option value="RETAIL">Comercios / retail</option>
                    </select>
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                    >
                      {saving ? "Guardando..." : "Guardar número"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

type ServiceStatusCardProps = {
  title: string;
  status?: ServiceStatus | null;
  loading: boolean;
  accent: string;
};

function ServiceStatusCard({
  title,
  status,
  loading,
  accent,
}: ServiceStatusCardProps) {
  const ok = status?.ok;
  const indicatorColor = ok
    ? "bg-emerald-400"
    : status
    ? "bg-rose-400"
    : "bg-slate-300";
  const pulse = loading || ok ? "animate-pulse" : "";
  const latency =
    typeof status?.latencyMs === "number"
      ? `${status.latencyMs} ms`
      : "—";
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br ${accent} text-white shadow-lg`}>
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),_transparent_45%)]"></div>
      <div className="relative p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/70">
              {title}
            </p>
            <p className="text-xl font-semibold">
              {ok === undefined
                ? "Sin datos"
                : ok
                ? "Todo funcionando"
                : "Requiere atención"}
            </p>
          </div>
          <div
            className={`w-3 h-3 rounded-full ${indicatorColor} ${pulse} shadow-[0_0_10px_rgba(255,255,255,0.7)]`}
          ></div>
        </div>
        <p className="text-sm text-white/90 min-h-[40px]">
          {loading
            ? "Verificando estado..."
            : status?.message || "Sin información disponible."}
        </p>
        <div className="flex items-center justify-between text-xs text-white/80">
          <span>
            Latencia: <strong>{latency}</strong>
          </span>
          <span>
            Último chequeo:{" "}
            {status?.checkedAt
              ? new Date(status.checkedAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
