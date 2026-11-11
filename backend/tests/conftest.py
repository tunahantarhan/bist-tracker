import os

# Settings require a secret key; tests never touch the real .env values
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256")
