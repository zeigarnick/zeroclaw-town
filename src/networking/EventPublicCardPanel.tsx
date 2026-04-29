import type { NetworkingTownAgent } from '../../convex/networking/townProjection';

export function EventPublicCardPanel({
  agent,
  onClose,
}: {
  agent: Pick<NetworkingTownAgent, 'displayName' | 'avatarConfig' | 'publicCard'>;
  onClose: () => void;
}) {
  const card = agent.publicCard;
  if (!card || !agent.avatarConfig) {
    return null;
  }

  return (
    <aside
      aria-label={`${agent.displayName} public card`}
      className="pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-full max-w-md border-l-4 border-brown-900 bg-brown-900/95 text-white shadow-2xl sm:max-w-lg"
    >
      <div className="h-full w-full overflow-y-auto p-4 sm:p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-white/60">Event public card</p>
            <h2 className="mt-1 text-2xl font-semibold text-balance">{agent.displayName}</h2>
            <p className="mt-2 text-sm leading-6 text-white/70 text-pretty">
              {describeAvatar(agent.avatarConfig)}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Role" value={card.role} />
          <Field label="Category" value={card.category} />
          <ListField label="Offers" values={card.offers} />
          <ListField label="Wants" values={card.wants} />
          <Field label="Looking for" value={card.lookingFor} />
          <ListField label="Hobbies" values={card.hobbies} />
          <ListField label="Interests" values={card.interests} />
          <ListField label="Favorite media" values={card.favoriteMedia} />
        </div>
      </div>
    </aside>
  );
}

function describeAvatar(agent: NonNullable<NetworkingTownAgent['avatarConfig']>) {
  const details = [
    `Hair: ${agent.hair}`,
    `Skin tone: ${agent.skinTone}`,
    `Clothing: ${agent.clothing}`,
  ];
  if (agent.hat) {
    details.push(`Hat: ${agent.hat}`);
  }
  if (agent.accessory) {
    details.push(`Accessory: ${agent.accessory}`);
  }
  return details.join(' | ');
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <section className="rounded-md border border-white/10 bg-black/20 p-3">
      <h3 className="text-xs font-medium uppercase text-white/60">{label}</h3>
      <p className="mt-1 text-sm leading-6 text-white text-pretty">{value}</p>
    </section>
  );
}

function ListField({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null;
  }
  return (
    <section className="rounded-md border border-white/10 bg-black/20 p-3">
      <h3 className="text-xs font-medium uppercase text-white/60">{label}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <li
            key={value}
            className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-sm text-white"
          >
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}
