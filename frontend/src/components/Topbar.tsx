// src/components/Topbar.tsx
import React from "react";
import { buildApiUrl } from "../config";

type TopbarProps = {
  doctor: {
    name: string;
    email: string;
    profileImageUrl?: string | null;
  };
  businessLabel: string;
  onGoToProfile?: () => void;
  avatarUrl?: string | null;
  themeMode?: "dark" | "light";
  onToggleTheme?: () => void;
  notificationsCount?: number;
  notificationsOpen?: boolean;
  onToggleNotifications?: () => void;
  notificationsButtonRef?: React.Ref<HTMLButtonElement>;
  onToggleSidebar?: () => void;
};

const Topbar: React.FC<TopbarProps> = ({
  doctor,
  businessLabel,
  onGoToProfile,
  avatarUrl,
  themeMode = "dark",
  onToggleTheme,
  notificationsCount = 0,
  notificationsOpen = false,
  onToggleNotifications,
  notificationsButtonRef,
  onToggleSidebar,
}) => {
  const initials = doctor.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const resolvedAvatar =
    avatarUrl ??
    (doctor.profileImageUrl
      ? doctor.profileImageUrl.startsWith("http")
        ? doctor.profileImageUrl
        : buildApiUrl(`${doctor.profileImageUrl}`)
      : null);

  const formattedCount =
    notificationsCount > 99 ? "99+" : notificationsCount.toString();

  return (
    <header className="h-14 md:h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39F3D7]/40"
            aria-label="Abrir menú de navegación"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 6h16a1 1 0 1 0 0-2H4a1 1 0 0 0 0 2zm16 5H4a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2zm0 7H4a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2z" />
            </svg>
          </button>
        )}
        <div className="text-sm md:text-base font-semibold text-slate-800">
          {businessLabel}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#8fa0b3] border border-slate-200 rounded-full px-3 py-1 transition hover:text-[#031816] hover:border-transparent hover:bg-gradient-to-r hover:from-[#39F3D7] hover:to-[#68AFDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39F3D7]/40"
        >
          {themeMode === "dark" ? "🌙 Modo oscuro" : "☀️ Modo claro"}
        </button>

        {onToggleNotifications && (
          <button
            type="button"
            ref={notificationsButtonRef}
            onClick={onToggleNotifications}
            className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39F3D7]/40 ${
              notificationsOpen
                ? "border-transparent bg-gradient-to-r from-[#39F3D7] to-[#68AFDD] text-[#031816]"
                : "border-slate-100 bg-white/90 text-[#1b2938] hover:border-[#68AFDD]/50 hover:text-[#031816]"
            }`}
            aria-label="Abrir pendientes"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="currentColor"
              role="img"
              aria-hidden="true"
            >
              <path d="M12 2a6 6 0 0 0-6 6v2.382l-.894 2.236A1 1 0 0 0 6.06 14H18a1 1 0 0 0 .894-1.382L18 10.382V8a6 6 0 0 0-6-6zm0 20a3 3 0 0 0 2.995-2.824L15 19h-6a3 3 0 0 0 2.824 2.995L12 22z" />
            </svg>
            {notificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center px-1">
                {formattedCount}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onGoToProfile}
          className="group flex items-center gap-2 text-xs md:text-sm text-white rounded-full px-2 py-1 transition hover:text-[#031816] hover:bg-gradient-to-r hover:from-[#39F3D7] hover:to-[#68AFDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39F3D7]/40"
        >
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold overflow-hidden">
            {resolvedAvatar ? (
              <img
                src={resolvedAvatar}
                alt={doctor.name}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="hidden md:flex flex-col items-start">
            <span className="font-medium leading-tight text-white group-hover:text-[#031816] transition">
              {doctor.name}
            </span>
            <span className="text-[10px] text-[#8fa0b3] leading-tight group-hover:text-[#031816] transition">
              Mi cuenta
            </span>
          </div>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
