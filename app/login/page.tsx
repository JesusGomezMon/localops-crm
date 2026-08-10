import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  async function enter(formData: FormData) {
    "use server";

    try {
      await signIn("credentials", {
        username: String(formData.get("username") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        redirectTo: next ?? "/dashboard",
      });
    } catch (error) {
      // A successful sign-in also throws — Next signals redirects that way — so the
      // redirect has to be re-thrown or nobody ever reaches the dashboard.
      if (isRedirectError(error)) {
        throw error;
      }

      // Anything else is a rejected credential. Without this the user was bounced
      // back to a blank login form with no indication of what went wrong.
      if (error instanceof AuthError) {
        redirect("/login?error=1");
      }

      throw error;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <Link
        href="/"
        aria-label="Volver al inicio"
        className="fixed top-6 left-6 flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted transition hover:border-muted hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </Link>

      <div>
        <p className="eyebrow mb-4 text-gold">Panel</p>
        <h1 className="display text-3xl leading-none">Acceso para personal</h1>
        <p className="mt-4 text-sm text-muted">
          Usuario y contraseña. Nada llega por correo.
        </p>
      </div>

      {error ? (
        // Threat S4: one message for every failure. Saying "user not found" would
        // let someone map which accounts exist.
        <p className="card-surface px-4 py-3 text-sm text-danger">
          Usuario o contraseña incorrectos.
        </p>
      ) : null}

      <form action={enter} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="username" className="eyebrow text-muted">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="admin"
            className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted/50 focus:border-gold"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="eyebrow text-muted">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-foreground outline-none transition focus:border-gold"
          />
        </div>

        <button
          type="submit"
          className="rounded-full bg-gold px-6 py-3.5 text-sm font-semibold text-background transition hover:bg-gold-soft"
        >
          Entrar
        </button>
      </form>

      <p className="border-t border-line pt-6 text-xs text-muted">
        Acceso de desarrollo: <code className="text-foreground">admin</code> /{" "}
        <code className="text-foreground">admin123</code>. Cámbialo con{" "}
        <code className="text-foreground">ADMIN_PASSWORD</code> antes de publicar — el
        build de producción se niega a arrancar con la contraseña por defecto.
      </p>
    </main>
  );
}
