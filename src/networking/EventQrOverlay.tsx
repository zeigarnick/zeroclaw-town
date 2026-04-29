type EventQrOverlayProps = {
  skillUrl: string;
  eventId: string;
};

export function EventQrOverlay({ skillUrl, eventId }: EventQrOverlayProps) {
  const qrImageUrl = buildQrImageUrl(skillUrl);

  return (
    <aside className="pointer-events-auto absolute bottom-4 right-4 z-10 w-40 rounded border border-clay-500 bg-brown-900/95 p-3 text-clay-100 shadow-lg sm:w-52">
      <div className="flex items-start gap-3 sm:block">
        <img
          src={qrImageUrl}
          alt="QR code for OpenNetwork event skill"
          className="size-16 rounded bg-clay-100 p-1 sm:size-32"
        />
        <div className="min-w-0 sm:mt-3">
          <p className="text-xs uppercase text-clay-300">Join event</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{eventId}</p>
          <a
            href={skillUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block truncate text-xs text-clay-100 underline underline-offset-4"
          >
            Open skill.md
          </a>
        </div>
      </div>
    </aside>
  );
}

export function buildQrImageUrl(skillUrl: string) {
  const params = new URLSearchParams({
    size: '192x192',
    data: skillUrl,
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}
