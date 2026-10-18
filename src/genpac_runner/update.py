"""One-shot update command for manual container or shell invocations."""
import sys

from .pac import generate_pac
from .storage import initialize


def main():
    initialize()
    try:
        print(generate_pac())
        return 0
    except Exception as error:
        print("[update] " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
