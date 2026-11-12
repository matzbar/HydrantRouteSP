"""Script de limpeza do banco: apaga só o que o app não usa mais."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "limpar_banco", Path(__file__).resolve().parent.parent / "scripts" / "limpar_banco.py")
limpar_banco = importlib.util.module_from_spec(spec)
spec.loader.exec_module(limpar_banco)


class FakeResult:
    def __init__(self, n):
        self.deleted_count = n


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    @staticmethod
    def _match(doc, flt):
        if flt == limpar_banco.ORPHAN_GEOCACHE:
            return "provider" not in doc
        return True

    def count_documents(self, flt):
        return sum(self._match(d, flt) for d in self.docs)

    def delete_many(self, flt):
        before = len(self.docs)
        self.docs[:] = [d for d in self.docs if not self._match(d, flt)]
        return FakeResult(before - len(self.docs))


class FakeDb:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.setdefault(name, FakeCollection([]))

    def list_collection_names(self):
        return list(self.collections)

    def drop_collection(self, name):
        self.collections.pop(name, None)


def make_db(with_hydrants=True):
    cols = {"geocache": FakeCollection([
        {"key": "antigo1", "lat": 1, "lon": 2},
        {"key": "antigo2", "lat": 3, "lon": 4},
        {"key": "novo", "lat": 5, "lon": 6, "provider": "photon"},
    ])}
    if with_hydrants:
        cols["hydrants"] = FakeCollection([{"code": "1"}, {"code": "2"}])
    return FakeDb(cols)


def test_plan_does_not_change_anything():
    db = make_db()
    assert limpar_banco.plan(db) == {"geocache_sem_origem": 2, "geocache_total": 3, "colecao_hydrants": 2}
    assert db["geocache"].count_documents({}) == 3 and "hydrants" in db.list_collection_names()


def test_apply_removes_only_unused_data():
    db = make_db()
    assert limpar_banco.apply(db) == {"geocache_removidos": 2, "hydrants_removidos": 2}
    assert [d["key"] for d in db["geocache"].docs] == ["novo"]  # registros com origem ficam
    assert "hydrants" not in db.list_collection_names()
    assert limpar_banco.apply(db) == {"geocache_removidos": 0, "hydrants_removidos": None}  # idempotente


def test_main_without_mongo_url(monkeypatch, capsys):
    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.setattr(limpar_banco.Path, "resolve", lambda self: Path("/nao/existe/scripts/x.py"))
    assert limpar_banco.main([]) == 2
    assert "MONGO_URL não definida" in capsys.readouterr().out
