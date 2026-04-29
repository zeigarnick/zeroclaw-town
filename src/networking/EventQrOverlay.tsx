import { useEffect, useState } from 'react';
import { IApiAdapter } from './api';

type EventQrOverlayProps = {
  skillUrl: string;
  eventId: string;
  apiAdapter?: Pick<IApiAdapter, 'getEventSpaceConfig'>;
};

export function EventQrOverlay({ skillUrl, eventId, apiAdapter }: EventQrOverlayProps) {
  const [currentSkillUrl, setCurrentSkillUrl] = useState(skillUrl);
  const qrImageUrl = buildQrImageUrl(currentSkillUrl);

  useEffect(() => {
    let cancelled = false;
    setCurrentSkillUrl(skillUrl);
    if (!apiAdapter) {
      return () => {
        cancelled = true;
      };
    }
    void resolveCurrentEventSkillUrl(apiAdapter, eventId, skillUrl).then((nextSkillUrl) => {
      if (!cancelled) {
        setCurrentSkillUrl(nextSkillUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiAdapter, eventId, skillUrl]);

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
            href={currentSkillUrl}
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

export async function resolveCurrentEventSkillUrl(
  apiAdapter: Pick<IApiAdapter, 'getEventSpaceConfig'>,
  eventId: string,
  fallbackSkillUrl: string,
) {
  const response = await apiAdapter.getEventSpaceConfig(eventId);
  if (!response.success) {
    return fallbackSkillUrl;
  }
  return response.data?.skillUrl ?? fallbackSkillUrl;
}
