import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from chatbot import SATChatbot

load_dotenv()

# ---- Config ----
CSV_PATH = os.getenv("SATBOT_CSV", "/Users/emmabrugman/my-projects/SAT_chat_bot/data/data_cleaned.csv")
MODEL_NAME = os.getenv("SAT_BOT_MODEL", "gpt-4o-mini")
# Comma-separated list of allowed origins for CORS
ALLOWED_ORIGINS = os.getenv(
    "SATBOT_CORS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
).split(",")

app = Flask(__name__)
CORS(app, resources={
    r"/chat": {"origins": ALLOWED_ORIGINS},
    r"/health": {"origins": "*"}
})

# Initialize chatbot once
chatbot = SATChatbot(CSV_PATH, model=MODEL_NAME)


def _error(message, code=400, req_id=None):
    return jsonify({"status": "error", "error": message, "request_id": req_id}), code


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "message": "SAT Chatbot API is running"}), 200


# browser GET to see usage instead of 405
@app.route("/chat", methods=["GET"])
def chat_get_info():
    return jsonify({
        "usage": "POST JSON to this endpoint.",
        "example_body": {"message": "Help me with algebra factoring", "difficulty": "easy", "count": 3},
        "notes": "difficulty is optional (easy|medium|hard). count is optional (1..10)."
    }), 200


@app.route("/favicon.ico")
def favicon():
    # Avoid noisy 404s
    return ("", 204)


@app.route("/chat", methods=["POST"])
def chat():
    req_id = str(uuid.uuid4())

    if not request.is_json:
        return _error("Content-Type must be application/json", 415, req_id)

    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    difficulty = data.get("difficulty")
    count = data.get("count")
    # History: expected to be a list of {role: "", text: ""}
    history = data.get("history") or []

    if not user_message:
        return _error("No 'message' provided", 400, req_id)

    try:
        context = data.get("context")
        # reply is now a dict: {"text": ..., "question": ...}
        bot_output = chatbot.chat_response(user_message, history=history, context=context)

        return jsonify({
            "status": "success",
            "response": bot_output.get("text", ""),
            "question": bot_output.get("question"),
            "request_id": req_id
        }), 200

    except Exception as e:
        app.logger.exception(f"[{req_id}] /chat error")
        return _error(f"Something went wrong: {e}", 500, req_id)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5050"))
    print(f"Starting SAT Chatbot API with CSV={CSV_PATH} model={MODEL_NAME}")
    print(f"POST http://localhost:{port}/chat  body: {{'message':'Help me with algebra'}}")
    app.run(host="0.0.0.0", port=port, debug=True)
