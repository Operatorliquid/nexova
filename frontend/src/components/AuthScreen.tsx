// src/components/AuthScreen.tsx
import { useEffect, useState } from "react";
import { buildApiUrl } from "../config";
import { type BusinessType, getBusinessConfig } from "../businessConfig";
import logoWhite from "../assets/logo-white.svg";

type DoctorAvailabilityStatus = "available" | "unavailable" | "vacation";

type Doctor = {
  id: number;
  name: string;
  email: string;
  businessType: BusinessType;
  availabilityStatus?: DoctorAvailabilityStatus;
  profileImageUrl?: string | null;
};

type AuthMode = "login" | "register";

type AuthScreenProps = {
  onAuthSuccess: (token: string, doctor: Doctor) => void;
};

type LoginResponse = {
  token: string;
  doctor: Doctor;
};

const NON_HEALTH_SPECIALTY_PLACEHOLDER = "General";

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [gender, setGender] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("HEALTH");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const businessConfig = getBusinessConfig(businessType);
  const requiresSpecialty = businessConfig.register.requiresSpecialty;

  useEffect(() => {
    if (requiresSpecialty) {
      setSpecialty((prev) =>
        prev === NON_HEALTH_SPECIALTY_PLACEHOLDER ? "" : prev
      );
    } else {
      setSpecialty((prev) =>
        prev && prev !== NON_HEALTH_SPECIALTY_PLACEHOLDER
          ? prev
          : NON_HEALTH_SPECIALTY_PLACEHOLDER
      );
    }
  }, [requiresSpecialty]);

  const handleModeChange = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError(null);
    setLoading(false);
    setRegisterStep(1);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "register" && registerStep === 1) {
      if (!name.trim() || !email.trim() || !password.trim()) {
        setError("Completá nombre, email y contraseña para avanzar.");
        return;
      }
      setRegisterStep(2);
      setError(null);
      return;
    }

  if (mode === "register" && registerStep === 2) {
    if (!contactPhone.trim() || !gender.trim()) {
      setError("Completá teléfono y sexo para continuar.");
      return;
    }
    if (requiresSpecialty && !specialty.trim()) {
      setError("Elegí tu especialidad para continuar.");
      return;
    }
  }

    setLoading(true);
    setError(null);

    try {
      const url =
        mode === "login"
          ? buildApiUrl("/api/auth/login")
          : buildApiUrl("/api/auth/register");

      const body: any = {
        email,
        password,
      };

      if (mode === "register") {
        body.name = name;
        body.contactPhone = contactPhone;
        body.gender = gender;
        body.specialty = specialty;
        body.businessType = businessType;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Error en autenticación");
      }

      const json: LoginResponse = await res.json();
      onAuthSuccess(json.token, json.doctor);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto -mt-6 sm:-mt-10">
      <div className="mb-6 text-center">
        <img
          src={logoWhite}
          alt="Nexova logo"
          className="mx-auto w-56 sm:w-64 h-auto mb-2"
        />
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-5 mt-5">
          Smart connections, better business.
        </p>
        <p className="text-sm text-slate-500 mt-5">
          Ingresá con tu cuenta o creá una nueva.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-6 space-y-4">
        <div className="flex text-sm rounded-xl bg-slate-100 p-1 relative overflow-hidden">
          <button
            type="button"
            onClick={() => handleModeChange("login")}
            className={`flex-1 py-2 rounded-lg transition-all duration-300 ${
              mode === "login"
                ? "bg-white shadow text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("register")}
            className={`flex-1 py-2 rounded-lg transition-all duration-300 ${
              mode === "register"
                ? "bg-white shadow text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`h-6 w-6 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                    registerStep === 1
                      ? "bg-gradient-to-r from-[#39F3D7] to-[#68AFDD] text-[#031816]"
                      : "bg-white text-slate-500 border border-slate-200"
                  }`}
                >
                  1
                </span>
                <span className="font-medium">Datos de acceso</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide">
                  Paso {registerStep} de 2
                </span>
                <span
                  className={`h-6 w-6 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                    registerStep === 2
                      ? "bg-gradient-to-r from-[#39F3D7] to-[#68AFDD] text-[#031816]"
                      : "bg-white text-slate-500 border border-slate-200"
                  }`}
                >
                  2
                </span>
              </div>
            </div>
          )}

          {mode === "login" || (mode === "register" && registerStep === 1) ? (
            <>
              {mode === "register" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    placeholder="Dra. Ana García"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                  placeholder="tu-correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Contraseña
                </label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Teléfono / WhatsApp
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                  placeholder="+54 9 ..."
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Sexo
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 bg-white"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Seleccioná una opción</option>
                  <option value="femenino">Femenino</option>
                  <option value="masculino">Masculino</option>
                  <option value="otro">Otro / Prefiero no decir</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Tipo de negocio
                </label>
                <div className="rounded-xl border border-slate-200 p-3 text-xs space-y-2">
                  {[
                    {
                      value: "HEALTH",
                      label: "Servicios de salud (clínicas, consultorios, etc.)",
                    },
                    {
                      value: "BEAUTY",
                      label: "Servicios de belleza (peluquería, estética)",
                    },
                    {
                      value: "RETAIL",
                      label: "Comercios y tiendas",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex items-start gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="businessType"
                        className="mt-[2px]"
                        value={option.value}
                        checked={businessType === option.value}
                        onChange={() =>
                          setBusinessType(option.value as BusinessType)
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

            {requiresSpecialty && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Especialidad
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 bg-white"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                  >
                    <option value="">Seleccioná una especialidad</option>
                    {[
                      "Doctor/a general",
                      "Médico/a clínico/a",
                      "Oftalmólogo/a",
                      "Pediatra",
                      "Cardiólogo/a",
                      "Ginecólogo/a",
                      "Dermatólogo/a",
                      "Traumatólogo/a",
                      "Kinesiólogo/a",
                      "Otro",
                    ].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {mode === "register" && registerStep === 2 && (
              <button
                type="button"
                onClick={() => setRegisterStep(1)}
                className="btn btn-outline btn-md w-full text-sm font-medium"
              >
                Volver al paso anterior
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-md w-full text-sm font-semibold disabled:opacity-60"
            >
              {loading
                ? "Procesando..."
                : mode === "login"
                ? "Iniciar sesión"
                : registerStep === 1
                ? "Continuar"
                : "Crear cuenta y entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
