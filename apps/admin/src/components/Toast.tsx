import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

type Tone = 'success' | 'error';
/** An action on a toast — "Undo" after a move that can be reversed. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
  action?: ToastAction;
}

const Ctx = createContext<{ success: (t: string, action?: ToastAction) => void; error: (t: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Tone, text: string, action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-3), { id, tone, text, action }]);
      setTimeout(() => remove(id), tone === 'error' ? 7000 : action ? 7000 : 3500);
    },
    [remove],
  );
  const api = { success: (t: string, action?: ToastAction) => push('success', t, action), error: (t: string) => push('error', t) };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
            {t.tone === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.text}</span>
            {t.action && (
              <button type="button" className="toast-action" onClick={() => { t.action!.onClick(); remove(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => remove(t.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
