"""Application entry point."""
import threading

from .pac import generate_pac
from .scheduler import scheduler_loop
from .storage import initialize
from .web import make_server


def main():
    initialize()
    try:
        # Rebuild the PAC from saved SQLite settings on every container start.
        generate_pac()
    except Exception as error:
        # Keep the UI available so the operator can correct settings or retry.
        print("[startup] 初次生成 PAC 失败：%s" % error, flush=True)

    threading.Thread(
        target=scheduler_loop,
        name="pac-scheduler",
        daemon=True,
    ).start()

    server = make_server()
    print("[web] genpac-runner listening on 0.0.0.0:8080", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
