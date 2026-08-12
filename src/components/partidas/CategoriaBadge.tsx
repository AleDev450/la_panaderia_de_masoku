import { CategoriaEvento } from "@/lib/supabase/types";

const CATEGORIA_LABEL: Record<CategoriaEvento, string> = {
  dota2: "Dota 2",
  csgo: "Counter-Strike",
  lol: "League of Legends",
  valorant: "Valorant",
  otros: "Otros",
};

export function CategoriaBadge({ categoria }: { categoria: CategoriaEvento }) {
  return (
    <span className="rounded-md border border-gold-dark/60 px-2 py-1 text-[11px] font-semibold tracking-wide text-parchment/60">
      {CATEGORIA_LABEL[categoria]}
    </span>
  );
}

export const CATEGORIA_OPTIONS: { value: CategoriaEvento; label: string }[] = (
  Object.entries(CATEGORIA_LABEL) as [CategoriaEvento, string][]
).map(([value, label]) => ({ value, label }));
