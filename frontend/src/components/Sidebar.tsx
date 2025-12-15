// src/components/Sidebar.tsx
import logoWhite from "../assets/logo-white.svg";

export type SidebarSection =
  | "stock"
  | "dashboard"
  | "risk"
  | "agenda"
  | "orders"
  | "debts"
  | "patients"
  | "history"
  | "metrics"
  | "documents"
  | "attachments"
  | "promotions"
  | "profile";

interface SidebarProps {
  activeSection: SidebarSection;
  onChangeSection: (section: SidebarSection) => void;
  doctorName: string;
  businessLabel: string;
  businessShort: string;
  contactPluralLabel: string;
  sections: { key: SidebarSection; label: string }[];
  whatsappStatus: "connected" | "pending" | "disconnected";
  whatsappNumber: string | null;
  whatsappLoading: boolean;
  whatsappError: string | null;
  onRequestConnect: () => void;
  onRequestDisconnect: () => void;
  onLogout: () => void;
  className?: string;
}

function Sidebar({
  activeSection,
  onChangeSection,
  doctorName,
  businessLabel,
  businessShort,
  contactPluralLabel,
  sections,
  whatsappStatus,
  whatsappNumber,
  whatsappLoading,
  whatsappError,
  onRequestConnect,
  onRequestDisconnect,
  onLogout,
  className = "",
}: SidebarProps) {
  const statusStyles = {
    connected: {
      label: "Conectado",
      badge: "bg-emerald-200 text-emerald-900",
      dot: "bg-emerald-400",
    },
    pending: {
      label: "Pendiente",
      badge: "bg-amber-200 text-amber-900",
      dot: "bg-amber-400",
    },
    disconnected: {
      label: "Desconectado",
      badge: "bg-white text-slate-600",
      dot: "bg-slate-400",
    },
  } as const;

  const currentStatus =
    statusStyles[whatsappStatus] || statusStyles.disconnected;
  const isConnected = whatsappStatus === "connected";

  const handleWhatsappClick = () => {
    if (isConnected) {
      onRequestDisconnect();
    } else {
      onRequestConnect();
    }
  };

  return (
    <aside
      className={`flex flex-col w-64 bg-[#121212] border-r border-[#262626] px-6 py-6 gap-8 ${className}`.trim()}
    >
      <div className="flex items-center justify-start">
        <img
          src={logoWhite}
          alt={`${businessLabel || doctorName || businessShort} logo`}
          className="w-32 h-auto"
        />
      </div>

      <nav className="flex flex-col gap-2 text-sm">
        <span className="text-[11px] uppercase tracking-wide text-muted">
          Navegación
        </span>
        {(sections.length
          ? sections
        : ([
            { key: "dashboard", label: "Dashboard" },
            { key: "risk", label: "Radar crítico" },
            { key: "agenda", label: "Agenda & Turnos" },
            { key: "orders", label: "Pedidos" },
            { key: "promotions", label: "Promociones" },
            { key: "debts", label: "Seguimiento de deudas" },
            { key: "patients", label: contactPluralLabel },
            { key: "history", label: "Historia clínica" },
            { key: "metrics", label: "Métricas" },
            { key: "attachments", label: "Comprobantes" },
            { key: "profile", label: "Mi perfil" },
            ] as { key: SidebarSection; label: string }[])
        ).map((item) => {
          const active = activeSection === item.key;
          return (
            <button
              key={item.key}
              className={`px-3 py-2 rounded-xl text-left transition border ${
                active
                  ? "bg-gradient-to-r from-[#183c45] to-[#0f1f27] text-white border-transparent shadow-lg shadow-black/40"
                  : "border-transparent text-muted hover:text-white hover:border-[#2a4c57] hover:bg-[#1b2329]"
              }`}
              onClick={() => onChangeSection(item.key)}
            >
              {item.label}
            </button>
          );
        })}

        <button
          className="btn btn-danger btn-sm w-full justify-center gap-2"
          onClick={onLogout}
        >
          <span>Cerrar sesión</span>
          <span aria-hidden="true">
            <svg
              viewBox="0 0 512 512"
              className="w-3 h-3 fill-current opacity-80"
            >
              <path d="M497 273L329 441c-9 9-25 9-34 0s-9-25 0-34l105-105H192c-13 0-24-11-24-24s11-24 24-24h208L295 149c-9-9-9-25 0-34s25-9 34 0l168 168c4 4 6 10 6 17s-2 13-6 17zM160 96V64c0-18-14-32-32-32H64C29 32 0 61 0 96v320c0 35 29 64 64 64h64c18 0 32-14 32-32v-32c0-18-14-32-32-32H96V128h32c18 0 32-14 32-32z" />
            </svg>
          </span>
        </button>
      </nav>

      <div className="mt-auto rounded-2xl bg-gradient-to-br from-[#0b1d23] via-[#122c36] to-[#173744] text-slate-50 px-4 py-4 text-xs border border-[#1b3b45] shadow-lg shadow-black/40">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide mb-2">
          <span className="font-semibold">WhatsApp</span>
          <span
            className={`px-2 py-0.5 rounded-full font-medium ${currentStatus.badge}`}
          >
            {currentStatus.label}
          </span>
        </div>
        <p className="text-slate-200/80 mb-3">
          {isConnected
            ? "Tu asistente ya está activo. Podés usar este número para pruebas:"
            : "Conectá tu número para que el asistente confirme turnos y envíe recordatorios."}
        </p>
        <div className="text-sm font-semibold mb-3">
          {isConnected ? whatsappNumber || "—" : "Sin número asignado"}
        </div>
        {isConnected && whatsappNumber && (
          <div className="text-[11px] bg-white/10 border border-white/20 rounded-xl px-3 py-2 mb-3">
            <p className="text-slate-200/80">Número asignado</p>
            <p className="text-sm font-semibold text-white">{whatsappNumber}</p>
          </div>
        )}
        {whatsappError && (
          <p className="text-[11px] text-rose-100 bg-rose-500/20 border border-rose-300/40 rounded-xl px-3 py-2 mb-2">
            {whatsappError}
          </p>
        )}
        <button
          className="w-full text-xs bg-white text-slate-900 rounded-xl py-2 font-medium disabled:opacity-60"
          onClick={handleWhatsappClick}
          disabled={whatsappLoading || whatsappStatus === "pending"}
        >
          {whatsappLoading
            ? "Procesando..."
            : isConnected
            ? "Desconectar"
            : "Conectar ahora"}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
