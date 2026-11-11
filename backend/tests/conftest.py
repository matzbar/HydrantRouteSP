import sys
from pathlib import Path

# Permite `import server`, `import cb_sp`... rodando o pytest de dentro ou de fora de backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
