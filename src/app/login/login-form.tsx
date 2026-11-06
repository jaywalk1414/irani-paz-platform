// app/login/login-form.tsx
'use client';

import { useActionState } from 'react';
import { authenticate, type LoginState } from './actions';

const inputClass =
  'mt-1.5 block w-full rounded-lg border border-[#E5E9E5] bg-white px-3.5 py-2.5 ' +
  'text-end text-[#252B28] placeholder:text-[#737B75]/70 ' +
  'transition-colors duration-150 hover:border-[#737B75]/50 ' +
  'focus:border-[#234B3B] focus:outline-none focus:ring-2 focus:ring-[#234B3B]/20 ' +
  'disabled:bg-[#F8F9F6] disabled:opacity-60';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    authenticate,
    undefined,
  );

  return (
    <form
      action={formAction}
      dir="rtl"
      lang="fa"
      aria-busy={pending}
      className="w-full max-w-sm space-y-5 rounded-xl border border-[#E5E9E5] bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#252B28]">ورود کارکنان</h1>
        <p className="text-sm leading-7 text-[#737B75]">
          برای دسترسی به پنل رستوران وارد شوید.
        </p>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-[#D9534F]/30 bg-[#D9534F]/10 px-3.5 py-2.5 text-sm leading-6 text-[#D9534F]"
        >
          {state.error}
        </p>
      )}

      <label className="block text-sm font-medium text-[#252B28]">
        ایمیل
        <input
          name="email"
          type="email"
          required
          dir="ltr"
          autoComplete="username"
          placeholder="name@example.com"
          disabled={pending}
          className={inputClass}
        />
      </label>

      <label className="block text-sm font-medium text-[#252B28]">
        رمز عبور
        <input
          name="password"
          type="password"
          required
          dir="ltr"
          autoComplete="current-password"
          placeholder="••••••••"
          disabled={pending}
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#234B3B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#193A2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2 active:bg-[#193A2D] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'در حال ورود…' : 'ورود'}
      </button>
    </form>
  );
}