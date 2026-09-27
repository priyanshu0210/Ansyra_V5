import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export function DealSelector({ deals, value, onChange, disabled = false }: {
  deals: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = deals.find((d) => d.id === value);
  const matching = deals.filter((d) => d.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  // Bound the rendered list, while searching the entire supplied portfolio.
  const visible = matching.slice(0, 50);
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Deal: ${selected?.name ?? "Select deal"}`} aria-expanded={open} disabled={disabled || !deals.length}
        className="flex min-h-11 w-full max-w-md items-center justify-between gap-3 rounded-full border px-4 py-2 text-left font-sans text-sm disabled:opacity-50"
        style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}>
        <span className="min-w-0 break-words">{selected?.name ?? (deals.length ? "Select deal" : "No deals available")}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>
    </PopoverTrigger>
    {/* Portals leave the dashboard container; retain its existing surface tokens. */}
    <PopoverContent data-surface="operate" align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0" style={{ color: "var(--fg)", background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}>
      <Command shouldFilter={false} className="bg-transparent font-sans text-inherit">
        <CommandInput aria-label="Search deals" placeholder="Search deals…" value={search} onValueChange={setSearch} className="text-base" />
        <CommandList aria-label="Deals" className="max-h-64">
          <CommandEmpty>No matching deals.</CommandEmpty>
          {visible.map((d) => <CommandItem key={d.id} value={String(d.id)} onSelect={() => { onChange(d.id); setOpen(false); setSearch(""); }} className="min-h-11 gap-2 whitespace-normal break-words">
            <span className="flex-1">{d.name}</span>{d.id === value && <Check aria-label="Selected" className="h-4 w-4 shrink-0" />}
          </CommandItem>)}
        </CommandList>
        {matching.length > visible.length && <p className="p-3 text-sm" role="status">Showing 50 of {matching.length}. Type to narrow your search.</p>}
      </Command>
    </PopoverContent>
  </Popover>;
}
