import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Plus, Loader2 } from "lucide-react";

const DEFAULT = {
  code: "",
  type: "coluna",
  status: "operacional",
  street: "",
  number: "",
  city: "São Paulo, SP, Brasil",
};

export default function HydrantForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULT);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code || !form.street) return;
    await onSubmit(form);
    setForm(DEFAULT);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="hydrant-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Código / ID</Label>
          <Input
            data-testid="input-code"
            placeholder="HDR-001"
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
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
          <div>
            <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Estado</Label>
            <Select value={form.status} onValueChange={(v) => update("status", v)}>
              <SelectTrigger data-testid="select-status" className="bg-[#0B0F17] border-[#26334D] text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#121824] border-[#26334D] text-slate-100">
                <SelectItem value="operacional">Operacional</SelectItem>
                <SelectItem value="inoperante">Inoperante</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Rua</Label>
          <Input
            data-testid="input-street"
            placeholder="Avenida Paulista"
            value={form.street}
            onChange={(e) => update("street", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
            required
          />
        </div>
        <div>
          <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Número</Label>
          <Input
            data-testid="input-number"
            placeholder="1578"
            value={form.number}
            onChange={(e) => update("number", e.target.value)}
            className="bg-[#0B0F17] border-[#26334D] text-slate-100"
          />
        </div>
      </div>
      <div>
        <Label className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">Cidade</Label>
        <Input
          data-testid="input-city"
          value={form.city}
          onChange={(e) => update("city", e.target.value)}
          className="bg-[#0B0F17] border-[#26334D] text-slate-100"
        />
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
