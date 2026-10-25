"""A small script to edit and run in Margin's integrated terminal."""


def greet(name: str) -> str:
    return f"Hello, {name}. Make yourself at home."


if __name__ == "__main__":
    print(greet("world"))
