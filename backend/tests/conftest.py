import os

os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB_NAME", "private_chat_test")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "chrome-extension://test")
