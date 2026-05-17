from __future__ import annotations

import json
import re
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT.parent
DATA_DIR = ROOT / "data"


CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十百]+章$")
QUESTION_RE = re.compile(r"^(\d{1,3})\.\s*(.+)$")
PAGE_NUMBER_RE = re.compile(r"^\d{1,3}$")


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip())


def is_section(line: str) -> bool:
    return line.endswith("部分") and 3 <= len(line) <= 16


def is_page_number(line: str) -> bool:
    return bool(PAGE_NUMBER_RE.match(line))


def read_pdf_lines(pdf_path: Path) -> tuple[list[dict], int]:
    doc = fitz.open(pdf_path)
    lines: list[dict] = []
    for page_index, page in enumerate(doc, start=1):
        for block in page.get_text("dict")["blocks"]:
            for pdf_line in block.get("lines", []):
                raw = "".join(span["text"] for span in pdf_line["spans"])
                line = clean_line(raw)
                if not line:
                    continue
                lines.append(
                    {
                        "text": line,
                        "page": page_index,
                        "x": float(pdf_line["bbox"][0]),
                        "size": max(float(span["size"]) for span in pdf_line["spans"]),
                    }
                )
    return lines, doc.page_count


def normalize_answer(lines: list[str]) -> str:
    text = "\n".join(lines).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def build_questions(lines: list[dict]) -> list[dict]:
    questions: list[dict] = []
    current_section = "未分组"
    current_chapter = "未分章"
    pending_chapter = ""
    expected_number = 1
    current: dict | None = None

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        current["answer"] = normalize_answer(current.pop("_answer_lines"))
        current["answerLength"] = len(current["answer"])
        questions.append(current)
        current = None

    for item in lines:
        line = item["text"]
        page = item["page"]

        if is_page_number(line):
            continue

        if is_section(line):
            finish_current()
            current_section = line
            current_chapter = line
            pending_chapter = ""
            expected_number = 1
            continue

        if CHAPTER_RE.match(line):
            finish_current()
            pending_chapter = line
            expected_number = 1
            continue

        if pending_chapter:
            if is_page_number(line):
                continue
            current_chapter = f"{pending_chapter} {line}"
            pending_chapter = ""
            expected_number = 1
            continue

        match = QUESTION_RE.match(line)
        if match:
            number = int(match.group(1))
            prompt = match.group(2).strip()
            is_heading_style = item["size"] >= 13 and item["x"] < 55
            # True question headings restart at 1 after each chapter and then
            # advance monotonically. Numbered answer items are kept as answer text.
            if is_heading_style and number == expected_number and len(prompt) >= 2:
                finish_current()
                sequence = len(questions) + 1
                current = {
                    "id": f"edu-{sequence:03d}",
                    "section": current_section,
                    "chapter": current_chapter,
                    "number": number,
                    "question": prompt,
                    "answer": "",
                    "sourcePage": page,
                    "_answer_lines": [],
                }
                expected_number += 1
                continue

        if current:
            current["_answer_lines"].append(line)

    finish_current()
    return questions


def build_report(pdf_name: str, page_count: int, questions: list[dict]) -> str:
    chapter_counts: dict[str, int] = {}
    for question in questions:
        key = f"{question['section']} / {question['chapter']}"
        chapter_counts[key] = chapter_counts.get(key, 0) + 1

    suspicious = [
        question
        for question in questions
        if question["answerLength"] < 12
        or question["chapter"] == "未分章"
        or question["section"] == "未分组"
    ]

    lines = [
        "# 题库抽取检查报告",
        "",
        f"- 来源 PDF：{pdf_name}",
        f"- PDF 页数：{page_count}",
        f"- 抽取题目数：{len(questions)}",
        f"- 疑似需人工检查：{len(suspicious)}",
        "",
        "## 章节题量",
        "",
    ]
    for chapter, count in chapter_counts.items():
        lines.append(f"- {chapter}: {count} 题")

    lines.extend(["", "## 疑似异常题目", ""])
    if suspicious:
        for question in suspicious[:80]:
            lines.append(
                f"- {question['id']} 第 {question['sourcePage']} 页 "
                f"{question['chapter']} / {question['number']}. {question['question']} "
                f"(答案字数 {question['answerLength']})"
            )
    else:
        lines.append("- 未发现明显异常。")

    lines.extend(
        [
            "",
            "## 抽样",
            "",
        ]
    )
    sample_indexes = [0, 1, 2, len(questions) // 2, max(0, len(questions) - 1)]
    seen: set[int] = set()
    for index in sample_indexes:
        if index in seen or index >= len(questions):
            continue
        seen.add(index)
        question = questions[index]
        answer_preview = question["answer"].replace("\n", " ")[:120]
        lines.append(
            f"- {question['id']} 第 {question['sourcePage']} 页 "
            f"{question['question']} -> {answer_preview}"
        )

    return "\n".join(lines) + "\n"


def main() -> None:
    pdfs = sorted(SOURCE_DIR.glob("*.pdf"))
    if not pdfs:
        raise FileNotFoundError(f"No PDF found in {SOURCE_DIR}")

    pdf_path = pdfs[0]
    lines, page_count = read_pdf_lines(pdf_path)
    questions = build_questions(lines)

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "questions.json").write_text(
        json.dumps(
            {
                "source": pdf_path.name,
                "pageCount": page_count,
                "generatedBy": "quiz-pwa/tools/extract_questions.py",
                "questions": questions,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (DATA_DIR / "extraction-report.md").write_text(
        build_report(pdf_path.name, page_count, questions),
        encoding="utf-8",
    )
    print(f"Extracted {len(questions)} questions from {page_count} pages.")


if __name__ == "__main__":
    main()
