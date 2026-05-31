"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShoppingCart, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Zadej platný e-mail"),
  password: z.string().min(6, "Heslo musí mít alespoň 6 znaků"),
});

const registerSchema = loginSchema.extend({
  full_name: z.string().min(2, "Zadej jméno"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Hesla se neshodují",
  path: ["confirmPassword"],
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function handleLogin(data: LoginForm) {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(data.email, data.password);
      localStorage.setItem("access_token", res.data.access_token);
      localStorage.setItem("refresh_token", res.data.refresh_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Přihlášení se nezdařilo");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(data: RegisterForm) {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.register(data.email, data.password, data.full_name);
      localStorage.setItem("access_token", res.data.access_token);
      localStorage.setItem("refresh_token", res.data.refresh_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registrace se nezdařila");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg">
            <ShoppingCart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">SmartCart</h1>
          <p className="text-gray-500 mt-1">AI nákupní asistent pro Rohlik.cz</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={cn(
                  "flex-1 py-2 rounded-md text-sm font-medium transition-all",
                  mode === m
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {m === "login" ? "Přihlášení" : "Registrace"}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Login form */}
          {mode === "login" && (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <Field label="E-mail">
                <input
                  type="email"
                  placeholder="jana@example.com"
                  className={inputCls(!!loginForm.formState.errors.email)}
                  {...loginForm.register("email")}
                />
                <ErrMsg msg={loginForm.formState.errors.email?.message} />
              </Field>
              <Field label="Heslo">
                <input
                  type="password"
                  placeholder="••••••••"
                  className={inputCls(!!loginForm.formState.errors.password)}
                  {...loginForm.register("password")}
                />
                <ErrMsg msg={loginForm.formState.errors.password?.message} />
              </Field>
              <SubmitBtn loading={loading} label="Přihlásit se" />
            </form>
          )}

          {/* Register form */}
          {mode === "register" && (
            <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
              <Field label="Jméno">
                <input
                  type="text"
                  placeholder="Jana Nováková"
                  className={inputCls(!!registerForm.formState.errors.full_name)}
                  {...registerForm.register("full_name")}
                />
                <ErrMsg msg={registerForm.formState.errors.full_name?.message} />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  placeholder="jana@example.com"
                  className={inputCls(!!registerForm.formState.errors.email)}
                  {...registerForm.register("email")}
                />
                <ErrMsg msg={registerForm.formState.errors.email?.message} />
              </Field>
              <Field label="Heslo">
                <input
                  type="password"
                  placeholder="min. 6 znaků"
                  className={inputCls(!!registerForm.formState.errors.password)}
                  {...registerForm.register("password")}
                />
                <ErrMsg msg={registerForm.formState.errors.password?.message} />
              </Field>
              <Field label="Potvrzení hesla">
                <input
                  type="password"
                  placeholder="••••••••"
                  className={inputCls(!!registerForm.formState.errors.confirmPassword)}
                  {...registerForm.register("confirmPassword")}
                />
                <ErrMsg msg={registerForm.formState.errors.confirmPassword?.message} />
              </Field>
              <SubmitBtn loading={loading} label="Zaregistrovat se" />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ErrMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors mt-2"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );
}

const inputCls = (hasErr: boolean) =>
  cn(
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
    hasErr ? "border-red-400 bg-red-50" : "border-gray-300 bg-white"
  );
