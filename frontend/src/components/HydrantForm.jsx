import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Plus, Loader2 } from "lucide-react";

const DEFAULT = {
  code: "",
  type: "coluna",
  address: "",
  municipality: "São Paulo",
  last_inspection: "",
  status: "possivel_de_uso",
  sector: "",
};

export default function HydrantForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULT);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code || !form.address) return;
    const payload = { ...form, last_inspection: form.last_inspection || null };
    await onSubmit(payload);
    setForm(DEFAULT);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="hydrant-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Código / ID</Label>
          <Input
            data-testid="input-code"
            placeholder="15214"
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
            required
          />
        </div>
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Tipo</Label>
          <Select value={form.type} onValueChange={(v) => update("type", v)}>
            <SelectTrigger data-testid="select-type" className="bg-[#0B0F17] border-[#26334D] text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#121824] border-[#26334D] text-slate-100">
              <SelectItem value="coluna">Coluna</SelectItem>
              <SelectItem value="subterraneo">Subterrâneo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Endereço</Label>
        <Input
          data-testid="input-address"
          placeholder="Rua Luis Romanini esquina com a Rua Dr. Carlos Camilo Haddad"
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          className="bg-[#0B0F17] border-[#26334D] text-slate-100"
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Município</Label>
          <Input
            data-testid="input-municipality"
            value={form.municipality}
            onChange={(e) => update("municipality", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Última Vistoria</Label>
          <Input
            data-testid="input-last-inspection"
            type="date"
            value={form.last_inspection}
            onChange={(e) => update("last_inspection", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Situação</Label>
          <Select value={form.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger data-testid="select-status" className="bg-[#0B0F17] border-[#26334D] text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#121824] border-[#26334D] text-slate-100">
              <SelectItem value="possivel_de_uso">Possível de uso</SelectItem>
              <SelectItem value="inoperante">Inoperante</SelectItem>
              <SelectItem value="nao_localizado">Não localizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Setor</Label>
          <Input
            data-testid="input-sector"
            placeholder="4289"
            value={form.sector}
            onChange={(e) => update("sector", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={loading}
        data-testid="submit-hydrant-btn"
        className="w-full btn-tactical-red font-display uppercase tracking-wider text-sm font-bold"
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
        Cadastrar Hidrante
      </Button>
    </form>
  );
}
