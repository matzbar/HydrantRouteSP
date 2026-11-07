import React, { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Upload, FileDown, Loader2 } from "lucide-react";

const CSV_TEMPLATE = `code,type,status,street,number,city
HDR-001,coluna,operacional,Avenida Paulista,1578,"São Paulo, SP"
HDR-002,subterraneo,operacional,Rua da Consolação,930,"São Paulo, SP"
HDR-003,coluna,inoperante,Praça da Sé,1,"São Paulo, SP"
`;

export default function CsvUpload({ onUpload, loading }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    await onUpload(file);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-hidrantes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 font-mono-t uppercase tracking-widest">
        Colunas aceitas: code, type, status, street, number, city
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
        data-testid="csv-file-input"
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          data-testid="upload-csv-btn"
          className="flex-1 bg-[#1A2234] hover:bg-[#26334D] border border-[#26334D] text-slate-100 font-display uppercase tracking-wider text-sm font-bold"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Enviar CSV
        </Button>
        <Button
          type="button"
          onClick={downloadTemplate}
          variant="ghost"
          data-testid="download-template-btn"
          className="text-slate-300 hover:text-white hover:bg-[#1A2234] font-mono-t text-xs uppercase tracking-widest"
        >
          <FileDown className="w-4 h-4 mr-2" />
          Modelo
        </Button>
      </div>
      {fileName && <p className="text-xs text-slate-500 font-mono-t">Último arquivo: {fileName}</p>}
    </div>
  );
}
