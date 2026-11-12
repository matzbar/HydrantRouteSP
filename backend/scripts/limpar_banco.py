"""Limpa do MongoDB os dados que o app não usa mais.

Remove:
  1. do `geocache`, os registros sem origem (`provider`), gravados antes de o app separar a origem.
     Parte deles veio do geocodificador ArcGIS World, cujos termos não permitem guardar resultados
     sem conta paga. O app já os ignora; se algum endereço precisar de novo, ele é localizado outra vez.
  2. a coleção `hydrants`, do antigo cadastro de hidrantes (o app lê os hidrantes ao vivo do CB SP).

Por padrão só SIMULA e mostra o que seria apagado. Para apagar de verdade, use --aplicar.

Uso (dentro de backend/, com MONGO_URL e DB_NAME no ambiente ou no backend/.env):
    python scripts/limpar_banco.py              # simulação
    python scripts/limpar_banco.py --aplicar    # apaga

Pelo Docker, sem instalar nada (troque a connection string):
    docker compose run --rm -e MONGO_URL='mongodb+srv://...' -e DB_NAME=hydrantroute \\
        app python scripts/limpar_banco.py --aplicar
"""
import argparse
import os
import sys
from pathlib import Path

ORPHAN_GEOCACHE = {"provider": {"$exists": False}}
OLD_COLLECTION = "hydrants"


def plan(db) -> dict:
    """O que seria removido (não altera nada)."""
    return {
        "geocache_sem_origem": db["geocache"].count_documents(ORPHAN_GEOCACHE),
        "geocache_total": db["geocache"].count_documents({}),
        "colecao_hydrants": (db[OLD_COLLECTION].count_documents({})
                             if OLD_COLLECTION in db.list_collection_names() else None),
    }


def apply(db) -> dict:
    """Remove os dados sem uso e devolve quanto foi apagado."""
    removed = db["geocache"].delete_many(ORPHAN_GEOCACHE).deleted_count
    dropped = None
    if OLD_COLLECTION in db.list_collection_names():
        dropped = db[OLD_COLLECTION].count_documents({})
        db.drop_collection(OLD_COLLECTION)
    return {"geocache_removidos": removed, "hydrants_removidos": dropped}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Remove do MongoDB os dados que o HydrantRoute SP não usa mais.")
    parser.add_argument("--aplicar", action="store_true", help="apaga de verdade (sem isso, só simula)")
    args = parser.parse_args(argv)

    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    except ImportError:
        pass
    mongo_url, db_name = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME", "hydrantroute")
    if not mongo_url:
        print("MONGO_URL não definida. Defina a variável ou crie backend/.env (veja .env.example).")
        return 2

    from pymongo import MongoClient

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=15000)
    try:
        db = client[db_name]
        p = plan(db)
        hyd = "não existe" if p["colecao_hydrants"] is None else f"{p['colecao_hydrants']} documentos"
        print(f"Banco: {db_name}")
        print(f"  geocache: {p['geocache_sem_origem']} de {p['geocache_total']} registros sem origem (serão apagados)")
        print(f"  coleção 'hydrants' (cadastro antigo): {hyd}")
        if not args.aplicar:
            print("\nSimulação: nada foi apagado. Rode de novo com --aplicar para apagar.")
            return 0
        r = apply(db)
        hyd = "não existia" if r["hydrants_removidos"] is None else f"apagada ({r['hydrants_removidos']} documentos)"
        print(f"\nFeito: {r['geocache_removidos']} registros do geocache apagados; coleção 'hydrants' {hyd}.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
