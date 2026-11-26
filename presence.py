#!/usr/bin/env python3
"""Serve the mascot on http://127.0.0.1:8000 and report PIR motion at /presence.

The page asks /presence once a second and gets {"motion": N}, where N counts how many times the sensor
has seen movement. Whenever N changes, someone walked by.
Only listens on 127.0.0.1, so nothing on the school network can reach it.
Without a sensor (or not on a Pi) it still serves the page; motion is just never reported.
"""

import argparse
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

motion_count = 0
lock = threading.Lock()


def on_motion() -> None:
    global motion_count
    with lock:
        motion_count += 1


class Handler(SimpleHTTPRequestHandler):
    # Older Pythons do not know this type, and browsers want it for the PWA manifest.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

    def do_GET(self) -> None:
        if self.path != "/presence":
            return super().do_GET()
        body = json.dumps({"motion": motion_count}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        if not self.path.startswith("/presence"):  # the once-a-second poll would flood the log
            super().log_message(format, *args)


def start_sensor(pin: int) -> object | None:
    try:
        from gpiozero import MotionSensor
    except ImportError:
        print("gpiozero not installed: running without motion sensor")
        return None
    try:
        sensor = MotionSensor(pin)
    except Exception as error:  # no GPIO on this machine, or nothing wired up
        print(f"No motion sensor on GPIO{pin} ({error}): running without it")
        return None
    sensor.when_motion = on_motion
    print(f"Motion sensor on GPIO{pin}")
    return sensor


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pin", type=int, default=17, help="GPIO number the PIR's OUT is wired to (default 17)")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    sensor = start_sensor(args.pin)  # keep a reference, or the sensor is garbage-collected
    handler = partial(Handler, directory=str(Path(__file__).parent))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Mascot on http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if sensor:
            sensor.close()


if __name__ == "__main__":
    main()
