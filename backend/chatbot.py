import json
import sqlite3
import re
import os
import ast
from typing import List, Optional, Dict, Any

import pandas as pd
from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
client = OpenAI()

DEFAULT_MODEL = os.getenv("SAT_BOT_MODEL", "gpt-4o-mini")
MAX_EXAMPLES_DEFAULT = 2
MAX_RATIONALE_CHARS = 700

class SATChatbot:
    def __init__(self, csv_path: str, model: str = DEFAULT_MODEL):
        self.model = model

        # Load CSV and guarantee columns
        df = pd.read_csv(csv_path)
        needed = [
            "section","domain","domain_desc","skill_cd","skill_desc","difficulty",
            "type","passage","stem","choices","correct","rationale"
        ]
        for c in needed:
            if c not in df.columns:
                df[c] = ""

        # Normalize types and fill NaNs
        for c in needed:
            df[c] = df[c].fillna("").astype(str)

        # Lowercase helper columns for robust filtering
        df["section_lc"] = df["section"].str.lower()
        df["domain_desc_lc"] = df["domain_desc"].str.lower()
        df["skill_desc_lc"] = df["skill_desc"].str.lower()
        df["difficulty_lc"] = df["difficulty"].str.lower()

        self.df = df

        # In-memory SQLite for quick sampling
        self.conn = sqlite3.connect(':memory:', check_same_thread=False)
        self.df.to_sql("questions", self.conn, index=False)

        # Student-friendly phrases mapped to skill_desc patterns
        # Use substrings that will appear in skill_desc_lc
        self.skill_synonyms = {
            # Math
            "factoring": "linear",            # your sample has "Linear equations in one variable"
            "solve for x": "linear",
            "linear": "linear",
            "system": "systems of two linear equations",
            "systems": "systems of two linear equations",
            "quadratic": "quadratic",         # if present in your dataset
            "exponential": "exponential",
            "function": "functions",
            "slope": "linear",
            "intercept": "linear",
            "inequalit": "inequalit",         # inequality/inequalities
            "geometry": "geometry",           # catch-all if you have geometry skills
            "sector": "arc length and sector",
            "angle": "angle",
            "circle": "circle",
            # English
            "comma": "punctuation",
            "semicolon": "punctuation",
            "colon": "punctuation",
            "modifier": "modifier",
            "concision": "concision",
            "subject-verb": "agreement",
            "agreement": "agreement",
            "pronoun": "pronoun",
            "transition": "transition",
            "tone": "rhetoric",
        }

    # ---------- Text cleaning ----------
    def clean_math_text(self, text: str) -> str:
        """
        Convert SAT-exported math phrasing to normal math:
        - "StartFraction A Over B EndFraction" -> "(A)/(B)"
        - "left parenthesis a comma b right parenthesis" -> "(a, b)"
        - Replace common tokens like 'plus', 'minus', etc.
        """
        if not text:
            return text

        # Handle repeated StartFraction ... Over ... EndFraction
        # Greedy-safe. Apply until none remain
        frac_pat = re.compile(r"StartFraction\s*(.*?)\s*Over\s*(.*?)\s*EndFraction", flags=re.IGNORECASE)
        prev = None
        while prev != text:
            prev = text
            text = re.sub(frac_pat, r"(\1)/(\2)", text)

        replacements = {
            "left parenthesis": "(",
            "right parenthesis": ")",
            "left-parenthesis": "(",
            "right-parenthesis": ")",
            "comma": ",",
            "plus": "+",
            "minus": "-",
            "equals": "=",
            "times": "*",
            "divided by": "/",
            "squared": "^2",
            "cubed": "^3",
            "greater than or equal to": "≥",
            "less than or equal to": "≤",
            "greater than": ">",
            "less than": "<",
            "negative": "-",
            "pi": "π",
            "Over": "/",              # fallback if any remain
            "StartRoot": "√(",
            "EndRoot": ")",
        }
        # Simple token replaces
        for old, new in replacements.items():
            text = re.sub(rf"\b{re.escape(old)}\b", new, text, flags=re.IGNORECASE)

        # Collapse multiple spaces
        text = re.sub(r"\s+", " ", text).strip()

        # Fix spacing after commas in coordinates
        text = re.sub(r"\(\s*([-\dA-Za-z]+)\s*,\s*([-\dA-Za-z]+)\s*\)", r"(\1, \2)", text)

        return text

    # ---------- Choices parsing ----------
    def parse_choices(self, choices_raw: str) -> str:
        """
        Your CSV stores choices like:
        "[{'letter': 'A', 'text': '...'}, ...]"
        json.loads fails because of single quotes. Use ast.literal_eval fallback.
        """
        if not choices_raw or choices_raw.strip() == "[]":
            return "Free response question (no multiple choice options)"

        # Try json first, then literal_eval
        data = None
        try:
            data = json.loads(choices_raw)
        except Exception:
            try:
                data = ast.literal_eval(choices_raw)
            except Exception:
                return "Free response question (no multiple choice options)"

        if not isinstance(data, list) or not data:
            return "Free response question (no multiple choice options)"

        out_lines = []
        for ch in data:
            letter = str(ch.get("letter", "")).strip()
            txt = self.clean_math_text(str(ch.get("text", "")))
            if letter:
                out_lines.append(f"{letter}) {txt}")
            else:
                out_lines.append(txt)
        return "\n".join(out_lines)

    # ---------- Routing ----------
    def _detect_section(self, user_lower: str) -> str:
        if any(w in user_lower for w in ["english", "reading", "writing", "grammar", "comma", "semicolon", "punctuation"]):
            return "English"
        return "Math"

    def _detect_skill_like(self, user_lower: str) -> Optional[str]:
        # Use synonyms to decide a substring to match against skill_desc_lc
        for key, skill_like in self.skill_synonyms.items():
            if key in user_lower:
                return skill_like
        # As a fallback, if user says a general domain word, pass it through
        for token in ["linear", "system", "systems", "quadratic", "geometry", "punctuation"]:
            if token in user_lower:
                return token
        return None

    def _detect_difficulty(self, user_lower: str) -> Optional[str]:
        if "easy" in user_lower:
            return "easy"
        if "medium" in user_lower or "med" in user_lower or "intermediate" in user_lower:
            return "medium"
        if "hard" in user_lower or "challenging" in user_lower:
            return "hard"
        return None

    def _detect_count(self, user_lower: str) -> int:
        # If the user asks for N problems, respect it
        m = re.search(r"\b(\d{1,2})\b", user_lower)
        if m:
            n = int(m.group(1))
            return max(1, min(10, n))
        if any(w in user_lower for w in ["set", "several", "few", "practice"]):
            return 4
        return MAX_EXAMPLES_DEFAULT

    # ---------- Retrieval ----------
    def get_questions(
        self,
        section: str,
        skill_like: Optional[str],
        difficulty_like: Optional[str],
        limit: int
    ) -> List[Dict[str, Any]]:
        """
        Filter by section, optional skill_desc substring, optional difficulty,
        then sample randomly. Case-insensitive.
        """
        base = "SELECT * FROM questions WHERE lower(section) = ?"
        params = [section.lower()]

        if skill_like:
            base += " AND skill_desc_lc LIKE ?"
            params.append(f"%{skill_like.lower()}%")

        if difficulty_like:
            base += " AND difficulty_lc LIKE ?"
            params.append(f"%{difficulty_like.lower()}%")

        base += " ORDER BY RANDOM() LIMIT ?"
        params.append(limit)

        cur = self.conn.execute(base, params)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()

        # Fallbacks
        if not rows and skill_like:
            # Try section-only
            cur = self.conn.execute(
                "SELECT * FROM questions WHERE lower(section) = ? ORDER BY RANDOM() LIMIT ?",
                (section.lower(), limit),
            )
            rows = cur.fetchall()

        if not rows:
            # Last resort: anything
            cur = self.conn.execute("SELECT * FROM questions ORDER BY RANDOM() LIMIT ?", (limit,))
            rows = cur.fetchall()

        return [dict(zip(cols, r)) for r in rows]

    # ---------- Prompting ----------
    def format_item(self, q: Dict[str, Any], show_answer: bool) -> str:
        stem = self.clean_math_text(q.get("stem", ""))
        passage = self.clean_math_text(q.get("passage", ""))
        choices = self.parse_choices(q.get("choices", ""))

        rational = self.clean_math_text(q.get("rationale", ""))
        if len(rational) > MAX_RATIONALE_CHARS:
            rational = rational[:MAX_RATIONALE_CHARS] + "..."

        meta = f"Skill: {q.get('skill_desc','')} | Difficulty: {q.get('difficulty','')}"

        parts = []
        if passage:
            parts.append(f"Passage:\n{passage}\n")
        parts.append(f"Question: {stem}")
        if choices.strip():
            parts.append(choices)

        if show_answer:
            parts.append(f"\nAnswer: {q.get('correct','')}")
            if rational.strip():
                parts.append(f"Official Explanation: {rational}")

        parts.append(meta)
        return "\n".join(parts).strip()

    def format_frontend_context(self, ctx: Dict[str, Any]) -> str:
        """
        Parses the question object from the frontend into a readable string for the prompt.
        """
        stem = self.clean_math_text(ctx.get("stem") or ctx.get("stem_html") or "")
        passage = self.clean_math_text(ctx.get("stimulus") or ctx.get("stimulus_html") or ctx.get("passage") or "")
        
        # handle choice lists or stored text
        choices_data = ctx.get("choices")
        choices_str = ""
        if isinstance(choices_data, list):
            lines = []
            for ch in choices_data:
                # ch is dict {key: 'A', text: '...', ...}
                let = ch.get("key") or ch.get("letter") or ""
                txt = self.clean_math_text(ch.get("text") or ch.get("html") or "")
                lines.append(f"{let}) {txt}")
            choices_str = "\n".join(lines)
        else:
            choices_str = str(choices_data or "")

        # Correct answer
        correct = ctx.get("answer") or ctx.get("correct_letters")
        if isinstance(correct, list):
            correct = correct[0]
            
        rationale = self.clean_math_text(ctx.get("rationale") or ctx.get("rationale_html") or "")
        
        parts = []
        if passage: parts.append(f"Passage/Stimulus:\n{passage}")
        if stem: parts.append(f"Question Stem:\n{stem}")
        if choices_str: parts.append(f"Choices:\n{choices_str}")
        if correct: parts.append(f"Correct Answer: {correct}")
        if rationale: parts.append(f"Explanation: {rationale}")
        
        return "\n\n".join(parts)

    def build_system_prompt(self) -> str:
        return (
            "You are a patient, Socratic SAT tutor. NEVER give the answer immediately. "
            "Your goal is to guide the student to the answer with hints and questions. "
            "1. If the student asks for a hard problem, provide ONE problem from the examples (or generate similar). "
            "   DO NOT solve it. Just state the problem. "
            "2. Wait for the student's attempt. "
            "3. If they are wrong, give a small hint. "
            "4. If they are right, congratulate them and explain briefly why. "
            "5. If they ask for the answer, ask them to guess first or try one step. "
            "6. Only give the full explanation if they are completely stuck after multiple tries. "
            "Keep responses short and encouraging."
        )

    def create_tutor_prompt(self, qs: List[Dict[str, Any]], user_message: str) -> str:
        show_answer = any(k in user_message.lower() for k in ["answer", "which letter", "just tell me", "final"])
        formatted = []
        for i, q in enumerate(qs, 1):
            formatted.append(f"--- Example {i} ---\n{self.format_item(q, show_answer)}")
        examples = "\n\n".join(formatted)

        guide = (
            "Please help the student by:\n"
            "1) Addressing their question directly\n"
            "2) Using the examples above only as needed\n"
            "3) Showing step-by-step reasoning with tiny steps\n"
            "4) Ending with one short strategy tip"
        )
        return f"{examples}\n\nStudent: \"{user_message}\"\n\n{guide}"

    # ---------- LLM ----------
    # ---------- LLM ----------
    def _llm(self, messages: List[Dict[str, str]], max_tokens: int = 800, temperature: float = 0.7) -> str:
        try:
            resp = client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            return resp.choices[0].message.content
        except Exception as e:
            return f"Sorry, I had trouble reaching the model. Details for developer: {str(e)}"

    # ---------- Public API ----------
    # ---------- Public API ----------
    def chat_response(self, user_message: str, history: List[Dict[str, str]] = [], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        # 1. Build context from history
        # Frontend sends: [{'role': 'user'|'bot', 'text': '...'}, ...]
        # Map to OpenAI: {'role': 'user'|'assistant', 'content': '...'}
        messages = [{"role": "system", "content": self.build_system_prompt()}]
        
        for msg in history:
            role = "user" if msg.get("role") == "user" else "assistant"
            content = msg.get("text", "")
            messages.append({"role": role, "content": content})

        # 2. RAG / Context Injection (only for the latest user message or if needed)
        # We'll inject examples into the system prompt or as a context message if it's a new topic.
        # For simplicity, let's detect if we need new questions based on the ONLY the latest user message.
        
        user_lower = user_message.lower()
        
        # If the history is empty, or the user is changing topic, we might fetch examples.
        # But if we are in a conversation loop (history > 0), we might skip fetching NEW examples 
        # unless asked.
        
        # Let's always fetch examples to be safe, but maybe strictly related to the current query.
        section = self._detect_section(user_lower)
        skill_like = self._detect_skill_like(user_lower)
        difficulty_like = self._detect_difficulty(user_lower)
        limit = self._detect_count(user_lower)

        qs = self.get_questions(section, skill_like, difficulty_like, limit)
        
        # Create a "Context" string to inject as a system meesage or user prefix
        # We don't want to overwhelm existing history. 
        # Strategy: "Hidden" system message with examples.
        if qs:
            ex_str = self.create_tutor_prompt(qs, user_message) 
            # Note: create_tutor_prompt returns a big string with examples + user msg. 
            # We want just the examples part potentially, or just use it as is for the "context".
            
            # Extract just the examples part to inject context
            # Actually, `create_tutor_prompt` does too much (adds student msg). 
            # Let's inline the example building here for better control or modify create_tutor_prompt.
            # For minimal code impact, let's just make a context string.
            
            formatted_ex = []
            for i, q in enumerate(qs, 1):
                # Don't show answer in the prompt context given to the model acting as tutor? 
                # actually the model NEEDS the answer to tutor.
                # So we show_answer=True to the model.
                formatted_ex.append(f"--- Available Problem {i} ---\n{self.format_item(q, show_answer=True)}")
            
            context_msg = (
                "Here are some relevant SAT problems you can use to quiz the student if they asked for one. "
                "Do NOT solve them immediately. Just present the 'Question' part if asked.\n\n" + 
                "\n\n".join(formatted_ex)
            )
            
            # Insert context after system prompt
            messages.insert(1, {"role": "system", "content": context_msg})

        # 3. Add active screen context
        if context:
            try:
                ctx_str = self.format_frontend_context(context)
                sys_ctx = (
                    f"CONTEXT: The student is currently looking at the following problem on their screen.\n"
                    f"They might ask 'how do I solve this' or 'is A correct?'. Refers to THIS problem:\n\n"
                    f"{ctx_str}"
                )
                # put this right after the main system prompt so it's fresh
                messages.insert(1, {"role": "system", "content": sys_ctx})
            except Exception as e:
                print(f"Error formatting context: {e}")

        # Finally add the latest user message (if not already in history? 
        # assumed history includes previous turns, but maybe not current?
        # Standard: history usually excludes current pending message, or includes it.
        # Let's assume caller might NOT include it in history or might. 
        # Safer to append `user_message` explicitly if it's not the last one in `messages`.
        
        if not messages or messages[-1]["content"] != user_message:
             messages.append({"role": "user", "content": user_message})

        llm_text = self._llm(messages)
        
        # Decide if we should attach a question payload
        # Heuristic: if we fetched questions (qs) AND the user was likely asking for one (implied by getting qs results)
        # We'll attach the first one for the UI to render.
        attached_question = None
        if qs and len(qs) > 0:
            # We only attach one for the interactive card
            attached_question = qs[0]
            
        return {
            "text": llm_text,
            "question": attached_question
        }


if __name__ == "__main__":
    bot = SATChatbot("/Users/emmabrugman/my-projects/SAT_chat_bot/data/data_cleaned.csv")
    msgs = [
        "Help me with algebra factoring",
        "I keep missing comma questions in writing",
        "Geometry area of a sector tip please",
        "What is the answer for this algebra question?"
    ]
    for m in msgs:
        print("\nUser:", m)
        print("Bot:", bot.chat_response(m))
