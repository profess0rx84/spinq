export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="absolute left-5 right-5 bottom-24 px-4 py-[13px] bg-surface-2 border border-accent-40 rounded-xl text-[13px] text-text text-center shadow-[0_8px_30px_rgba(0,0,0,.5)] animate-toast-in">
      {message}
    </div>
  );
}
