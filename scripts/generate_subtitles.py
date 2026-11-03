import json
import os
import sys

import av
from faster_whisper import WhisperModel


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def patch_pyav_compatibility() -> None:
    original_open = av.open

    def open_compatibility(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return original_open(*args, **kwargs)

    av.open = open_compatibility


def main() -> None:
    if len(sys.argv) not in (2, 4):
        raise ValueError("Expected a video path and optional start/duration")

    patch_pyav_compatibility()
    video_path = sys.argv[1]
    start = float(sys.argv[2]) if len(sys.argv) == 4 else 0
    duration = float(sys.argv[3]) if len(sys.argv) == 4 else None
    model_name = os.environ.get("WHISPER_MODEL", "base")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
    language = os.environ.get("WHISPER_LANGUAGE", "ja")
    model = WhisperModel(model_name, device="auto", compute_type=compute_type)
    options = {
        "task": "translate",
        "language": language,
        "vad_filter": True,
        "beam_size": 5,
        "best_of": 5,
        "temperature": 0,
        "condition_on_previous_text": True,
    }
    if duration is not None:
        options["clip_timestamps"] = [start, start + duration]

    segments, _ = model.transcribe(
        video_path,
        **options,
    )

    result = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            result.append(
                {
                    "start": segment.start,
                    "end": segment.end,
                    "text": text,
                }
            )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
