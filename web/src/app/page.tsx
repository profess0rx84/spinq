import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center text-text">
      <div className="text-[28px] font-bold tracking-[.04em]">SPINQ</div>
      <div className="max-w-sm text-[14px] leading-[1.6] text-text-2">
        Guests scan a QR code and request songs from their phone. You run the queue from the
        booth — no yelling over the music.
      </div>
      <Link
        href="/booth/login"
        className="rounded-xl bg-accent px-6 py-3.5 text-[14px] font-bold text-on-accent"
      >
        Open the DJ Booth
      </Link>
    </div>
  );
}
