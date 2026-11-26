"""Ponto de entrada da API na Vercel (função Python serverless).

A Vercel roda os arquivos de api/ como funções; o vercel.json manda todo /api/... para esta. O código do app
continua em backend/ (o mesmo usado pelo Docker e pelos testes): aqui só o colocamos no caminho de importação.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from server import app  # noqa: E402,F401  (a Vercel procura a variável `app`)
