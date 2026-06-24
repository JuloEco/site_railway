"""
Tanks Platform - plateforme de salons pour duels d'artillerie locaux.

Le jeu se joue toujours au clavier sur un seul ordinateur (2 a 4 joueurs
se partagent les commandes a tour de role), mais chaque partie vit dans
un "salon" identifie par un code. Plusieurs salons peuvent exister en
parallele sur le serveur, chacun avec ses propres joueurs et son propre
tableau des scores, qui persiste tant que le serveur tourne.
"""
import random
import string
import time

from flask import Flask, abort, jsonify, render_template, request

app = Flask(__name__)

# ---------- Stockage en memoire ----------
ROOMS = {}  # code -> room dict

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sans I/O/0/1 (ambigus)
CODE_LENGTH = 4
VALID_COLORS = ["red", "blue", "yellow", "purple"]
MIN_PLAYERS = 2
MAX_PLAYERS = 4


def generate_code():
    while True:
        code = "".join(random.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in ROOMS:
            return code


def new_room():
    code = generate_code()
    ROOMS[code] = {
        "code": code,
        "players": [],   # [{"pseudo": str, "color": str}]
        "scores": {},    # pseudo -> nombre de victoires
        "started": False,
        "created_at": time.time(),
    }
    return ROOMS[code]


def get_room_or_404(code):
    room = ROOMS.get(code.upper())
    if room is None:
        abort(404, description="Salon introuvable")
    return room


def public_room(room):
    """Vue du salon renvoyee au front (pas de champs internes)."""
    return {
        "code": room["code"],
        "players": room["players"],
        "scores": room["scores"],
        "started": room["started"],
        "available_colors": [c for c in VALID_COLORS if c not in {p["color"] for p in room["players"]}],
        "max_players": MAX_PLAYERS,
        "min_players": MIN_PLAYERS,
    }


# ---------- Pages ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/room/<code>")
def room_page(code):
    code = code.upper()
    if code not in ROOMS:
        return render_template("index.html", error=f"Le salon {code} n'existe pas (ou plus)."), 404
    return render_template("room.html", code=code)


# ---------- API salons ----------
@app.route("/api/rooms", methods=["POST"])
def create_room():
    room = new_room()
    return jsonify(public_room(room)), 201


@app.route("/api/rooms/<code>", methods=["GET"])
def room_state(code):
    room = get_room_or_404(code)
    return jsonify(public_room(room))


@app.route("/api/rooms/<code>/players", methods=["POST"])
def add_player(code):
    room = get_room_or_404(code)
    if room["started"]:
        return jsonify({"error": "La partie a deja commence dans ce salon."}), 400
    if len(room["players"]) >= MAX_PLAYERS:
        return jsonify({"error": f"Salon plein ({MAX_PLAYERS} joueurs max)."}), 400

    data = request.get_json(silent=True) or {}
    pseudo = (data.get("pseudo") or "").strip()[:16]
    color = data.get("color")

    if not pseudo:
        return jsonify({"error": "Pseudo requis."}), 400
    if color not in VALID_COLORS:
        return jsonify({"error": "Couleur invalide."}), 400
    if any(p["pseudo"].lower() == pseudo.lower() for p in room["players"]):
        return jsonify({"error": "Ce pseudo est deja pris dans ce salon."}), 400
    if any(p["color"] == color for p in room["players"]):
        return jsonify({"error": "Cette couleur est deja prise."}), 400

    room["players"].append({"pseudo": pseudo, "color": color})
    room["scores"].setdefault(pseudo, 0)
    return jsonify(public_room(room)), 201


@app.route("/api/rooms/<code>/players/<pseudo>", methods=["DELETE"])
def remove_player(code, pseudo):
    room = get_room_or_404(code)
    if room["started"]:
        return jsonify({"error": "La partie a deja commence dans ce salon."}), 400
    room["players"] = [p for p in room["players"] if p["pseudo"].lower() != pseudo.lower()]
    return jsonify(public_room(room))


@app.route("/api/rooms/<code>/start", methods=["POST"])
def start_room(code):
    room = get_room_or_404(code)
    if len(room["players"]) < MIN_PLAYERS:
        return jsonify({"error": f"Il faut au moins {MIN_PLAYERS} joueurs."}), 400
    room["started"] = True
    return jsonify(public_room(room))


@app.route("/api/rooms/<code>/result", methods=["POST"])
def record_result(code):
    room = get_room_or_404(code)
    data = request.get_json(silent=True) or {}
    winner = data.get("winner")
    if not any(p["pseudo"] == winner for p in room["players"]):
        return jsonify({"error": "Joueur gagnant inconnu dans ce salon."}), 400
    room["scores"][winner] = room["scores"].get(winner, 0) + 1
    return jsonify(public_room(room))


@app.errorhandler(404)
def not_found(e):
    # Pour les appels API en JSON ; les pages utilisent leur propre gestion ci-dessus.
    if request.path.startswith("/api/"):
        return jsonify({"error": "Introuvable."}), 404
    return render_template("index.html", error="Page introuvable."), 404


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=5000)
