import json
import sys
from pathlib import Path
from pyswip import Prolog

KB_PATH = Path(__file__).resolve().parent / "knowledge_base.pl"

def main():
    if len(sys.argv) < 2 or not sys.argv[1]:
        print(json.dumps({"orientations": []}))
        return

    word_ids = sys.argv[1].split(",")
    prolog = Prolog()
    prolog.consult(str(KB_PATH))
    
    # Assert signs
    for wid in word_ids:
        safe = wid.strip().lower().replace("-", "_").replace(" ", "_")
        if safe.isidentifier():
            prolog.assertz(f"sena_detectada({safe})")
            
    # Query orientations
    orientations = []
    try:
        results = list(prolog.query("consultar_orientacion(Area, Mensaje)"))
        for r in results:
            area = str(r.get("Area", ""))
            mensaje = str(r.get("Mensaje", ""))
            if area and mensaje:
                orientations.append({"area": area, "message": mensaje})
    except Exception:
        pass
        
    print(json.dumps({"orientations": orientations}))

if __name__ == "__main__":
    main()
