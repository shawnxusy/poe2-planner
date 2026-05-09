import type { BuildItem, ItemRarity, ItemSlot } from "../lib/types";

const SLOT_ORDER: Array<{ slot: ItemSlot; label: string }> = [
  { slot: "helmet", label: "Helmet" },
  { slot: "body_armour", label: "Body Armour" },
  { slot: "gloves", label: "Gloves" },
  { slot: "boots", label: "Boots" },
  { slot: "weapon", label: "Weapon" },
  { slot: "offhand", label: "Offhand" },
  { slot: "belt", label: "Belt" },
  { slot: "amulet", label: "Amulet" },
  { slot: "ring_left", label: "Ring (L)" },
  { slot: "ring_right", label: "Ring (R)" },
];

const RARITY_NAME: Record<ItemRarity, string> = {
  normal: "text-ink-100",
  magic: "text-blue-400",
  rare: "text-gold-400",
  unique: "text-amber-500",
};

const RARITY_BORDER: Record<ItemRarity, string> = {
  normal: "border-ink-700/60",
  magic: "border-blue-500/25",
  rare: "border-gold-500/30",
  unique: "border-amber-600/35",
};

interface Props {
  items: BuildItem[];
}

export function GearPanel({ items }: Props) {
  const bySlot = new Map<ItemSlot, BuildItem>();
  const jewels: BuildItem[] = [];
  for (const item of items) {
    if (item.slot === "jewel") {
      jewels.push(item);
    } else {
      bySlot.set(item.slot, item);
    }
  }

  const equippedSlots = SLOT_ORDER.filter(({ slot }) => bySlot.has(slot));
  if (equippedSlots.length === 0 && jewels.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-gold-500/80">
        Gear
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {equippedSlots.map(({ slot, label }) => {
          const item = bySlot.get(slot)!;
          return <ItemCard key={slot} slotLabel={label} item={item} />;
        })}
      </div>

      {jewels.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
            Jewels ({jewels.length})
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {jewels.map((jewel, i) => (
              <ItemCard key={i} slotLabel="Jewel" item={jewel} compact />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ItemCard({
  slotLabel,
  item,
  compact = false,
}: {
  slotLabel: string;
  item: BuildItem;
  compact?: boolean;
}) {
  const displayName = item.unique_name ?? item.base_item;
  const nameCls = RARITY_NAME[item.rarity];
  const borderCls = RARITY_BORDER[item.rarity];

  return (
    <div
      className={`rounded-lg border bg-ink-900/60 ${borderCls} overflow-hidden`}
    >
      <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-500">
          {slotLabel}
        </span>
        {item.is_corrupted && (
          <span className="text-[10px] text-ember-500/70">corrupted</span>
        )}
      </div>

      <div className={`px-3 pb-1 text-sm font-medium leading-snug ${nameCls}`}>
        {displayName}
        {item.unique_name && item.unique_name !== item.base_item && (
          <span className="ml-1.5 text-xs font-normal text-ink-500">
            {item.base_item}
          </span>
        )}
      </div>

      {!compact && (item.implicits.length > 0 || item.affixes.length > 0) && (
        <div className="mt-1.5 border-t border-ink-700/40 px-3 pt-2 pb-2.5 space-y-0.5">
          {item.implicits.map((affix, i) => (
            <div key={`imp-${i}`} className="text-xs text-ink-400 leading-snug">
              {affix.text}
            </div>
          ))}
          {item.implicits.length > 0 && item.affixes.length > 0 && (
            <div className="my-1 h-px bg-ink-700/40" />
          )}
          {item.affixes.map((affix, i) => (
            <div key={`aff-${i}`} className="text-xs text-ink-300 leading-snug">
              {affix.text}
            </div>
          ))}
        </div>
      )}

      {compact && item.affixes.length > 0 && (
        <div className="border-t border-ink-700/40 px-3 pt-1.5 pb-2 text-[11px] text-ink-500">
          {item.affixes.length} mod{item.affixes.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
