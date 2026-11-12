import { useMemo } from "react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// Estação padrão: CBM · 03º GB · SGB 1 · SP - VILA FORMOSA
export const DEFAULT_STATION_CODE = "701031102";

const uniqSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

/** Seleção derivada de uma estação (usada para aplicar a estação padrão). */
export function selectionFromStation(station) {
  if (!station) return { cmd: "", gb: "", sgb: "", code: "" };
  return { cmd: station.cmd, gb: station.gb, sgb: station.sgb, code: station.code };
}

const triggerCls = "bg-[#0B0F17] border-[#26334D] text-slate-100";
const contentCls = "bg-[#121824] border-[#26334D] text-slate-100 max-h-72";
const labelCls = "font-mono-t text-[10px] uppercase tracking-widest text-slate-400";

function Field({ id, label, value, onChange, options, placeholder, disabled, testId }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id} className={labelCls}>{label}</Label>
      <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} data-testid={testId} className={triggerCls}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentCls}>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Seletor em cascata CMD REGIONAL → GB → SGB → ESTAÇÃO.
 * Ao mudar um nível, os níveis abaixo são limpos (ou preenchidos sozinhos quando só há uma opção).
 */
export default function StationPicker({ stations, value, onChange, disabled }) {
  const cmds = useMemo(() => uniqSorted(stations.map((s) => s.cmd)), [stations]);
  const gbs = useMemo(
    () => uniqSorted(stations.filter((s) => s.cmd === value.cmd).map((s) => s.gb)),
    [stations, value.cmd]
  );
  const sgbs = useMemo(
    () => uniqSorted(stations.filter((s) => s.cmd === value.cmd && s.gb === value.gb).map((s) => s.sgb)),
    [stations, value.cmd, value.gb]
  );
  const options = useMemo(
    () =>
      stations
        .filter((s) => s.cmd === value.cmd && s.gb === value.gb && s.sgb === value.sgb)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [stations, value.cmd, value.gb, value.sgb]
  );

  // Preenche os níveis abaixo de `partial` quando cada um tem uma única opção.
  const cascade = (partial) => {
    const next = { cmd: "", gb: "", sgb: "", code: "", ...partial };
    const pick = (list) => (list.length === 1 ? list[0] : "");
    if (next.cmd && !next.gb) next.gb = pick(uniqSorted(stations.filter((s) => s.cmd === next.cmd).map((s) => s.gb)));
    if (next.gb && !next.sgb)
      next.sgb = pick(uniqSorted(stations.filter((s) => s.cmd === next.cmd && s.gb === next.gb).map((s) => s.sgb)));
    if (next.sgb && !next.code) {
      const st = stations.filter((s) => s.cmd === next.cmd && s.gb === next.gb && s.sgb === next.sgb);
      next.code = st.length === 1 ? st[0].code : "";
    }
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="station-picker">
      <Field
        id="station-cmd"
        label="CMD Regional"
        value={value.cmd}
        onChange={(cmd) => cascade({ cmd })}
        options={cmds.map((c) => ({ value: c, label: c }))}
        placeholder="Selecione"
        disabled={disabled}
        testId="select-cmd"
      />
      <Field
        id="station-gb"
        label="GB"
        value={value.gb}
        onChange={(gb) => cascade({ cmd: value.cmd, gb })}
        options={gbs.map((g) => ({ value: g, label: `${g}º GB` }))}
        placeholder="Selecione"
        disabled={disabled || !value.cmd}
        testId="select-gb"
      />
      <Field
        id="station-sgb"
        label="SGB"
        value={value.sgb}
        onChange={(sgb) => cascade({ cmd: value.cmd, gb: value.gb, sgb })}
        options={sgbs.map((s) => ({ value: s, label: `${s} (${value.gb}.${s})` }))}
        placeholder="Selecione"
        disabled={disabled || !value.gb}
        testId="select-sgb"
      />
      <Field
        id="station-code"
        label="Estação"
        value={value.code}
        onChange={(code) => onChange({ ...value, code })}
        options={options.map((s) => ({ value: s.code, label: s.name }))}
        placeholder="Selecione"
        disabled={disabled || !value.sgb}
        testId="select-station"
      />
    </div>
  );
}
