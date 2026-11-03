import sys
import wave

import av


def main() -> None:
    if len(sys.argv) != 5:
        raise ValueError("Expected video path, output path, start, and duration")

    input_path, output_path = sys.argv[1], sys.argv[2]
    start = max(0.0, float(sys.argv[3]))
    end = start + max(1.0, float(sys.argv[4]))
    container = av.open(input_path)
    stream = next((item for item in container.streams.audio), None)
    if stream is None:
        raise ValueError("The video does not contain an audio stream")

    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    samples = bytearray()
    try:
        time_base = float(stream.time_base)
        seek_timestamp = max(0, int(start / time_base))
        container.seek(seek_timestamp, stream=stream, backward=True)
        for frame in container.decode(stream):
            if frame.pts is None:
                continue
            timestamp = float(frame.pts * stream.time_base)
            frame_duration = float(frame.samples / frame.sample_rate) if frame.sample_rate else 0
            if timestamp + frame_duration <= start:
                continue
            if timestamp >= end:
                break
            for converted in resampler.resample(frame):
                samples.extend(converted.to_ndarray().tobytes())
    finally:
        container.close()

    if not samples and start > 0:
        container = av.open(input_path)
        stream = next((item for item in container.streams.audio), None)
        if stream is None:
            container.close()
            raise ValueError("The video does not contain an audio stream")
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        try:
            for frame in container.decode(stream):
                if frame.pts is None:
                    continue
                timestamp = float(frame.pts * stream.time_base)
                frame_duration = float(frame.samples / frame.sample_rate) if frame.sample_rate else 0
                if timestamp + frame_duration <= start:
                    continue
                if timestamp >= end:
                    break
                for converted in resampler.resample(frame):
                    samples.extend(converted.to_ndarray().tobytes())
        finally:
            container.close()

    if not samples:
        raise ValueError("No audio samples were found in the requested range")
    with wave.open(output_path, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(samples)


if __name__ == "__main__":
    main()
