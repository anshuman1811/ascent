import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

const ICONS = {
  success: <CheckCircle2 size={15} className="text-green-400 shrink-0" />,
  error:   <AlertCircle  size={15} className="text-red-400 shrink-0" />,
  info:    <Info         size={15} className="text-indigo-400 shrink-0" />,
};

const BG = {
  success: 'bg-gray-900 border-green-800/60',
  error:   'bg-gray-900 border-red-800/60',
  info:    'bg-gray-900 border-indigo-800/60',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) =>
    setItems(prev => prev.filter(t => t.id !== id)), []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current;
    setItems(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none w-full max-w-xs px-4">
        {items.map(item => (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 w-full rounded-xl border px-3 py-2.5 shadow-xl pointer-events-auto ${BG[item.type]}`}
          >
            {ICONS[item.type]}
            <p className="text-xs text-gray-200 flex-1">{item.message}</p>
            <button onClick={() => dismiss(item.id)} className="text-gray-500 hover:text-gray-300">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
