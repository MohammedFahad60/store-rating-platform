import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  Star,
  X,
} from "lucide-react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const BUTTON_VARIANTS = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_8px_20px_rgba(105,92,244,.2)]",
  secondary: "bg-slate-700 hover:bg-slate-600 text-white",
  danger: "bg-red-600 hover:bg-red-500 text-white",
  success: "bg-emerald-600 hover:bg-emerald-500 text-white",
  ghost: "bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700",
  outline: "bg-transparent hover:bg-slate-800 text-blue-400 border border-blue-500/60",
};

export function Button({ variant = "primary", size = "md", loading = false, className = "", children, disabled, ...rest }) {
  const sizes = {
    xs: "px-2.5 py-1.5 text-[11px]",
    sm: "px-3 py-2 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-sm",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold tracking-[-.01em] border border-transparent transition-all duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none focus-visible:outline-none",
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
        sizes[size] || sizes.md,
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-semibold text-slate-300 mb-2">
          {label}
          {hint && <span className="text-slate-500 font-normal"> · {hint}</span>}
        </span>
      )}
      {children}
      {error && <span className="block text-xs text-red-400 mt-1.5" role="alert">{error}</span>}
    </label>
  );
}

const controlClasses = "w-full rounded-[10px] bg-slate-800/80 border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 shadow-[inset_0_1px_rgba(255,255,255,.025)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500/70 focus:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed";

export function Input({ className = "", ...rest }) {
  return <input className={cx(controlClasses, className)} {...rest} />;
}

export function Select({ className = "", children, ...rest }) {
  return <select className={cx(controlClasses, "cursor-pointer", className)} {...rest}>{children}</select>;
}

export function Textarea({ className = "", ...rest }) {
  return <textarea className={cx(controlClasses, "min-h-28 resize-y", className)} {...rest} />;
}

export function Alert({ kind = "error", title, children, className = "" }) {
  const styles = {
    error: "bg-red-500/[.08] border-red-400/25 text-red-200",
    success: "bg-emerald-500/[.08] border-emerald-400/25 text-emerald-200",
    info: "bg-blue-500/[.08] border-blue-400/25 text-blue-100",
    warning: "bg-amber-500/[.08] border-amber-400/25 text-amber-100",
  };
  const Icon = kind === "error" ? AlertTriangle : kind === "success" ? CheckCircle2 : kind === "info" ? Info : AlertTriangle;
  return (
    <div className={cx("flex gap-3 items-start rounded-xl border px-4 py-3 text-sm animate-[item-in_.25s_ease_both]", styles[kind], className)} role={kind === "error" ? "alert" : "status"}>
      <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children && <div className="opacity-90 leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 page-enter" role="status" aria-live="polite">
      <div className="relative grid place-items-center w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-400/20">
        <Loader2 className="animate-spin text-blue-300" size={22} />
      </div>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={cx("skeleton rounded-lg", className)} aria-hidden="true" />;
}

export function SkeletonCards({ count = 3 }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: count }, (_, i) => <div key={i} className="premium-card p-4 space-y-4"><Skeleton className="h-32" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-4/5" /></div>)}</div>;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6 page-enter">
      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-400/15 flex items-center justify-center mb-4">
        <Icon size={24} className="text-blue-300" aria-hidden="true" />
      </div>
      <h3 className="text-slate-100 font-semibold text-[15px]">{title}</h3>
      {children && <div className="text-sm text-slate-500 mt-2 max-w-md leading-relaxed">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[page-in_.2s_ease_both]" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className={cx("relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 w-full max-h-[min(90vh,760px)] flex flex-col animate-[modal-in_.25s_cubic-bezier(.2,.75,.25,1)_both]", sizes[size] || sizes.md)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 id="modal-title" className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-3 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = false, loading = false, onConfirm, onClose }) {
  return <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}><p className="text-sm text-slate-300 leading-relaxed">{message}</p></Modal>;
}

const STATUS_STYLES = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", INACTIVE: "bg-slate-500/15 text-slate-300 border-slate-500/30", DISABLED: "bg-red-500/15 text-red-400 border-red-500/30", VISIBLE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", HIDDEN: "bg-red-500/15 text-red-400 border-red-500/30", SUSPENDED: "bg-red-500/15 text-red-400 border-red-500/30", PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30", CONFIRMED: "bg-blue-500/15 text-blue-400 border-blue-500/30", IN_PROGRESS: "bg-violet-500/15 text-violet-400 border-violet-500/30", COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", CANCELLED: "bg-slate-500/15 text-slate-400 border-slate-500/30", REJECTED: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function StatusBadge({ status }) {
  const label = String(status || "").replace(/_/g, " ");
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[.08em] uppercase whitespace-nowrap", STATUS_STYLES[status] || STATUS_STYLES.INACTIVE)}>{label}</span>;
}

export function Stars({ value = 0, size = 15, interactive = false, onChange }) {
  const rounded = Math.round(Number(value));
  return <span className="inline-flex items-center gap-0.5" role={interactive ? "radiogroup" : undefined} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" disabled={!interactive} onClick={() => interactive && onChange?.(star)} aria-label={`${star} star`} aria-checked={interactive ? star <= rounded : undefined} role={interactive ? "radio" : undefined} className={cx(interactive ? "cursor-pointer focus:outline-none group" : "cursor-default", "p-0.5 rounded transition-transform", interactive && "hover:scale-125 active:scale-105")}><Star size={size} className={cx(star <= rounded ? "text-amber-400 fill-amber-400" : "text-slate-600", "transition-colors")} /></button>)}
  </span>;
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return <div className="flex items-center justify-center gap-2 py-5"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /> Prev</Button><span className="text-sm text-slate-400 px-2">Page <span className="text-slate-100 font-semibold">{page}</span> of {totalPages}</span><Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next <ChevronRight size={15} /></Button></div>;
}

export function StatCard({ label, value, icon: Icon, accent = "text-blue-400", sub, trend }) {
  return <div className="premium-card stat-card p-5"><div className="flex items-start justify-between gap-3 relative z-[1]"><div className="min-w-0"><p className="section-kicker truncate">{label}</p><p className="text-[1.8rem] leading-none font-bold tracking-[-.04em] text-white mt-3">{value}</p>{sub && <p className="text-xs text-slate-500 mt-2 truncate">{sub}</p>}{trend && <p className="text-xs text-emerald-400 mt-2">{trend}</p>}</div>{Icon && <div className="stat-icon"><Icon size={18} className={accent} /></div>}</div></div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return <div className="flex flex-wrap items-start justify-between gap-4 mb-7 page-enter"><div>{eyebrow && <p className="section-kicker mb-2">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{actions && <div className="flex items-center gap-2">{actions}</div>}</div>;
}

export function Card({ className = "", children }) { return <div className={cx("premium-card", className)}>{children}</div>; }
export function Th({ children, className = "" }) { return <th className={cx("px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[.12em] text-slate-500 whitespace-nowrap", className)}>{children}</th>; }
export function Td({ children, className = "" }) { return <td className={cx("px-4 py-4 text-sm text-slate-300", className)}>{children}</td>; }
